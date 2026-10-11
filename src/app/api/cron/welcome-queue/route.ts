import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/mail";
import { buildWelcomeEmail, dailyCap, sendGapMs } from "@/lib/outreach";
import { withHeartbeat } from "@/lib/cron-heartbeat";

export const maxDuration = 120;

const PER_RUN = 6;
const MAX_ATTEMPTS = 3;

// Sends the "confirm your profile" email for profiles created by bulk upload, a few at a time inside
// the shared daily limit and only in Indian daytime hours, so a 100-CV upload never becomes 100 emails
// in a few minutes.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return NextResponse.json({ ok: true, note: "Email not configured; nothing sent." });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const nowMs = new Date().getTime();
  const istHour = new Date(nowMs + 5.5 * 3600_000).getUTCHours();
  if (istHour < 9 || istHour >= 20) return NextResponse.json({ ok: true, note: "Outside sending hours (9:00 to 20:00 IST)." });

  const { data: stats } = await admin.rpc("outreach_stats");
  const s = (stats ?? {}) as { sent_24h?: number; first_sent_at?: string | null };
  const room = Math.max(0, dailyCap(s.first_sent_at ?? null, nowMs) - (s.sent_24h ?? 0));
  if (room <= 0) return NextResponse.json({ ok: true, note: "Daily limit reached; will resume as it frees up." });

  const { data: queued } = await admin
    .from("welcome_queue")
    .select("candidate_id, email, full_name, missing, attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(Math.min(PER_RUN, room));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const q of queued ?? []) {
    const { data: cand } = await admin.from("candidates").select("id, email_opt_out, profile_nudge_unsubscribed").eq("id", q.candidate_id).maybeSingle();
    if (!cand || cand.email_opt_out || cand.profile_nudge_unsubscribed) {
      await admin.from("welcome_queue").update({ status: "skipped" }).eq("candidate_id", q.candidate_id);
      skipped++;
      continue;
    }
    try {
      const redirectTo = `${process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com"}/candidate-portal`;
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: q.email, options: { redirectTo } });
      if (linkErr || !link?.properties?.action_link) throw new Error(linkErr?.message ?? "Could not create a login link");
      const mail = buildWelcomeEmail({ id: q.candidate_id, full_name: q.full_name }, q.missing ?? [], link.properties.action_link);
      await sendEmail({
        to: q.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        plain: true,
        headers: { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      await admin.from("welcome_queue").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("candidate_id", q.candidate_id);
      sent++;
    } catch (err) {
      const attempts = (q.attempts ?? 0) + 1;
      await admin
        .from("welcome_queue")
        .update({ status: attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, error: err instanceof Error ? err.message.slice(0, 300) : "send failed" })
        .eq("candidate_id", q.candidate_id);
      failed++;
    }
    await new Promise((r) => setTimeout(r, sendGapMs));
  }
  return NextResponse.json({ ok: true, sent, failed, skipped, remaining_room: room - sent });
}

export const GET = withHeartbeat("welcome-queue", 30, handler);
