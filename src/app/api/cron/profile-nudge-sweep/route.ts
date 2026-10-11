import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/mail";
import { APP_URL, buildReminderEmail, dailyCap } from "@/lib/outreach";
import { signUnsubscribeToken } from "@/lib/nudge-auth";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Automated escalating incomplete-profile nudge, requested because the only
// existing mechanism (candidates-table.tsx's "Send profile completion
// emails" bulk button) required a recruiter to remember to click it -- for
// a candidate nobody happens to look at, no reminder ever goes out. Schedule
// is day 3 / day 7 / day 14 since the profile was created, then stops (a
// 4th automated nudge is more likely to annoy than convert). A recruiter can
// still always send a manual one on top of this via the existing button.
export const maxDuration = 60;

const NUDGE_INTERVALS_DAYS = [3, 4, 7]; // cumulative: day 3, day 7 (3+4), day 14 (3+4+7)
const BATCH_LIMIT = 60;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ ok: true, note: "GMAIL_USER/GMAIL_APP_PASSWORD not configured -- no emails sent." });
  }

  // One shared daily limit across welcome emails, outreach and these reminders. Welcome emails run
  // earlier in the day and draw first, so reminders only use what is left.
  const { data: statsRaw } = await admin.rpc("outreach_stats");
  const stats = (statsRaw ?? {}) as { sent_24h?: number; first_sent_at?: string | null };
  let room = Math.max(0, dailyCap(stats.first_sent_at ?? null, new Date().getTime()) - (stats.sent_24h ?? 0));
  if (room <= 0) return NextResponse.json({ ok: true, checked: 0, note: "Daily limit reached; reminders wait for tomorrow." });

  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, full_name, email, created_at, segment_data, profile_nudge_count, profile_nudge_last_sent_at")
    .in("status", ["awaiting_input", "lead"])
    .eq("profile_nudge_unsubscribed", false)
    .lt("profile_nudge_count", NUDGE_INTERVALS_DAYS.length)
    .not("email", "is", null)
    .not("email", "ilike", "%.invalid")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const results: { candidate_id: string; sent: boolean; stage?: number; reason?: string }[] = [];

  // Anyone already asked in the last 7 days by a welcome email or by outreach is left alone, so a
  // person never gets two requests for the same details close together.
  const ids = (candidates ?? []).map((c) => c.id as string);
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const recentlyAsked = new Set<string>();
  if (ids.length) {
    const { data: w } = await admin.from("welcome_queue").select("candidate_id, status, sent_at").in("candidate_id", ids);
    for (const r of w ?? []) if (r.status === "queued" || (r.status === "sent" && r.sent_at && r.sent_at > sevenDaysAgo)) recentlyAsked.add(r.candidate_id as string);
    const { data: o } = await admin.from("profile_outreach").select("candidate_id").in("candidate_id", ids).in("status", ["sent", "failed"]).gt("created_at", sevenDaysAgo);
    for (const r of o ?? []) recentlyAsked.add(r.candidate_id as string);
  }

  for (const candidate of candidates ?? []) {
    const count = candidate.profile_nudge_count ?? 0;
    const intervalDays = NUDGE_INTERVALS_DAYS[count];
    if (intervalDays === undefined) {
      results.push({ candidate_id: candidate.id, sent: false, reason: "all nudges already sent" });
      continue;
    }

    // Gate off the most recent event -- created_at for the first nudge,
    // profile_nudge_last_sent_at for every subsequent one -- rather than
    // always measuring from created_at, so a delayed cron run (e.g. if a
    // sweep is skipped for a day) doesn't cause the next nudge to fire
    // early relative to the previous one actually going out.
    const anchor = count === 0 ? candidate.created_at : candidate.profile_nudge_last_sent_at ?? candidate.created_at;
    const anchorMs = new Date(anchor as string).getTime();
    const dueAt = anchorMs + intervalDays * 24 * 60 * 60 * 1000;
    if (now < dueAt) {
      results.push({ candidate_id: candidate.id, sent: false, reason: "not due yet" });
      continue;
    }

    if (recentlyAsked.has(candidate.id as string)) {
      results.push({ candidate_id: candidate.id, sent: false, reason: "already asked in the last 7 days" });
      continue;
    }
    if (room <= 0) {
      results.push({ candidate_id: candidate.id, sent: false, reason: "daily limit reached" });
      continue;
    }

    const unsubUrl = `${APP_URL}/api/unsubscribe-nudge?token=${encodeURIComponent(signUnsubscribeToken(candidate.id))}`;
    const segment = candidate.segment_data as { missing_fields?: unknown } | null;
    const missing = Array.isArray(segment?.missing_fields) ? segment!.missing_fields.filter((f): f is string => typeof f === "string") : [];
    const stage = (count + 1) as 1 | 2 | 3;
    const mail = buildReminderEmail(stage, { id: candidate.id as string, full_name: candidate.full_name as string | null }, missing, unsubUrl);

    try {
      await sendEmail({
        to: candidate.email as string,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        plain: true,
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      room--;

      await admin
        .from("candidates")
        .update({ profile_nudge_count: stage, profile_nudge_last_sent_at: new Date().toISOString() })
        .eq("id", candidate.id);

      await admin.from("audit_log").insert({
        actor: null,
        action: "profile_nudge_sent",
        entity: "candidate",
        entity_id: candidate.id,
        detail: { stage, to: candidate.email },
      });

      results.push({ candidate_id: candidate.id, sent: true, stage });
    } catch (err) {
      results.push({
        candidate_id: candidate.id,
        sent: false,
        reason: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  return NextResponse.json({ ok: true, checked: candidates?.length ?? 0, results });
}

export const GET = withHeartbeat("profile-nudge-sweep", 1440, handler);
