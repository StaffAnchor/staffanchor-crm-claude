import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";
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

const MISSING_FIELD_LABELS: Record<string, string> = {
  sub_domain: "your practice / vertical / function",
  current_employer: "your current employer",
  current_job_title: "your current job title",
  current_employment_status: "your employment status",
  current_industry: "your current industry",
  total_experience_years: "your total experience",
  current_fixed_ctc: "your current fixed CTC",
  expected_fixed_ctc: "your expected fixed CTC",
  notice_period: "your notice period / days to join",
  role_type: "whether you're an IC or leading a team",
  highest_qualification: "your highest qualification",
  work_mode: "your preferred work mode",
  open_to_relocation: "whether you're open to relocation",
  resume: "your resume",
};

function missingFieldText(segmentData: unknown): string {
  const missingFields = Array.isArray((segmentData as { missing_fields?: unknown } | null)?.missing_fields)
    ? (segmentData as { missing_fields: unknown[] }).missing_fields.filter((f): f is string => typeof f === "string")
    : [];
  if (missingFields.length === 0) return "";
  return ` Specifically, we still need: ${missingFields.map((f) => MISSING_FIELD_LABELS[f] ?? f).join(", ")}.`;
}

// Copy escalates in urgency/framing across the three touches rather than
// repeating the same email verbatim -- a candidate who ignored a friendly
// nudge on day 3 is unlikely to respond to the identical friendly nudge on
// day 14.
function subjectAndBodyFor(stage: 1 | 2 | 3, fullName: string, registerUrl: string, missingText: string) {
  if (stage === 1) {
    return {
      subject: "Complete your StaffAnchor candidate profile",
      intro: `Hi ${fullName},<br/><br/>Thanks for getting started with StaffAnchor.${missingText}`,
      cta: "Finish your profile so we can start matching you to the right roles:",
    };
  }
  if (stage === 2) {
    return {
      subject: "Still a few details away from being matched, " + fullName.split(" ")[0],
      intro: `Hi ${fullName},<br/><br/>Your StaffAnchor profile is still incomplete, so we haven't been able to match you against open roles yet.${missingText}`,
      cta: "It only takes a couple of minutes to finish:",
    };
  }
  return {
    subject: "Last reminder: your StaffAnchor profile is incomplete",
    intro: `Hi ${fullName},<br/><br/>This is our last automated reminder -- your StaffAnchor profile has been sitting incomplete for two weeks, so we haven't been able to consider you for any roles.${missingText}`,
    cta: "If you're still interested, this takes just a couple of minutes:",
  };
}

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

  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, full_name, email, created_at, segment_data, profile_nudge_count, profile_nudge_last_sent_at")
    .in("status", ["awaiting_input", "lead"])
    .eq("profile_nudge_unsubscribed", false)
    .lt("profile_nudge_count", NUDGE_INTERVALS_DAYS.length)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const results: { candidate_id: string; sent: boolean; stage?: number; reason?: string }[] = [];

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

    const registerUrl = `https://jobs.staffanchor.com/register?name=${encodeURIComponent(
      candidate.full_name
    )}&email=${encodeURIComponent(candidate.email as string)}&ref=${candidate.id}`;
    const unsubUrl = `https://staffanchor-crm-claude.vercel.app/api/unsubscribe-nudge?token=${encodeURIComponent(
      signUnsubscribeToken(candidate.id)
    )}`;
    const missingText = missingFieldText(candidate.segment_data);
    const stage = (count + 1) as 1 | 2 | 3;
    const { subject, intro, cta } = subjectAndBodyFor(stage, candidate.full_name, registerUrl, missingText);

    try {
      await sendEmail({
        to: candidate.email as string,
        subject,
        text: `${intro.replace(/<br\/?>/g, "\n")}\n\n${cta}\n${registerUrl}\n\nUnsubscribe from these reminders: ${unsubUrl}`,
        html: renderEmailShell({
          preheader: cta,
          bodyHtml: `<p>${intro}</p><p>${cta}</p><p><a href="${registerUrl}">${registerUrl}</a></p><p style="font-size:11px;color:#94A3B8;margin-top:24px;">Don't want these reminders? <a href="${unsubUrl}" style="color:#94A3B8;">Unsubscribe</a>.</p>`,
        }),
      });

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
