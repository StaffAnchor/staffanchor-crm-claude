import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";

// Escalating schedule, same shape as the candidate-facing profile-nudge
// sweep: a link sitting in stage="submitted" gets nudged once it crosses
// each of these day-marks, then stops for good (no more emails) once it's
// had all five -- rather than nagging forever every single day. Whoever
// still hasn't heard back after 15 days already knows; a daily email at
// that point is noise, not a useful reminder.
const FOLLOWUP_DAY_THRESHOLDS = [3, 5, 7, 10, 15];

// Daily digest: nudges staff when a client has sat on a shared shortlist
// with no feedback recorded on any of the candidates in it. Recruiters
// previously had to remember to chase this manually -- easy to let a
// pipeline go quiet once a shortlist is shared and attention moves on to
// the next mandate. One email per mandate that has a due reminder,
// listing which candidates are still waiting, sent to that mandate's
// assigned recruiter(s) plus all admins.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
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

  const earliestCutoff = new Date(
    Date.now() - FOLLOWUP_DAY_THRESHOLDS[0] * 24 * 60 * 60 * 1000
  ).toISOString();

  // Every link still sitting at "submitted" (i.e. shared with the client
  // but not yet moved forward) that's at least old enough to have crossed
  // the first reminder threshold, joined to its mandate and candidate for
  // the digest text. Per-link due-ness (which threshold, if any, it just
  // crossed) is worked out below in JS rather than in this query.
  //
  // Keyed off stage === "submitted" AND stage_updated_at, NOT the legacy
  // in_shortlist/client_feedback/shortlisted_at columns -- those are only
  // written by the public client-shortlist-link flow. When a recruiter
  // instead records the client's Yes/No by hand via the Stage dropdown
  // (the common real-world path -- client coordinates by phone/email),
  // those columns never update, so this digest kept nagging about
  // candidates that had already moved to Client Shortlisted/Offer/Placed
  // days or weeks earlier.
  const { data: staleLinks, error } = await admin
    .from("candidate_mandate_links")
    .select(
      "id, stage_updated_at, mandate_id, client_followup_count, client_followup_last_sent_at, candidates(full_name), mandates(id, role_title, client_name)"
    )
    .eq("stage", "submitted")
    .lt("stage_updated_at", earliestCutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type MandateGroup = {
    mandateId: string;
    roleTitle: string;
    clientName: string;
    candidates: { linkId: string; name: string; daysWaiting: number; reminderNumber: number }[];
  };
  const byMandate = new Map<string, MandateGroup>();
  for (const link of staleLinks ?? []) {
    const mandate = link.mandates as unknown as { id: string; role_title: string; client_name: string } | null;
    const candidate = link.candidates as unknown as { full_name: string } | null;
    if (!mandate || !candidate) continue;

    const stageUpdatedAt = new Date(link.stage_updated_at as string).getTime();
    const daysWaiting = Math.floor((Date.now() - stageUpdatedAt) / (24 * 60 * 60 * 1000));

    // A nudge count from a previous "submitted" spell for this same link
    // doesn't count against the current one -- if the stage changed and
    // came back to "submitted" more recently than the last nudge we sent,
    // treat this as a fresh cycle starting back at zero rather than
    // carrying over a stale count (and picking up mid-schedule, or worse,
    // being treated as already exhausted).
    const lastSentAt = link.client_followup_last_sent_at
      ? new Date(link.client_followup_last_sent_at as string).getTime()
      : null;
    const isFreshCycle = lastSentAt === null || lastSentAt < stageUpdatedAt;
    const effectiveCount = isFreshCycle ? 0 : (link.client_followup_count as number) ?? 0;

    // Exhausted the whole 3/5/7/10/15 schedule for this cycle -- stop
    // nudging until the stage changes (and this link either drops out of
    // the query entirely, or comes back around as a fresh cycle above).
    if (effectiveCount >= FOLLOWUP_DAY_THRESHOLDS.length) continue;

    // Not yet due for its next reminder.
    if (daysWaiting < FOLLOWUP_DAY_THRESHOLDS[effectiveCount]) continue;

    const reminderNumber = effectiveCount + 1; // 1-indexed for the email copy
    const existing = byMandate.get(mandate.id);
    const entry = { linkId: link.id as string, name: candidate.full_name, daysWaiting, reminderNumber };
    if (existing) {
      existing.candidates.push(entry);
    } else {
      byMandate.set(mandate.id, {
        mandateId: mandate.id,
        roleTitle: mandate.role_title,
        clientName: mandate.client_name,
        candidates: [entry],
      });
    }
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const results: { mandate_id: string; notified: number; error?: string }[] = [];

  if (byMandate.size === 0) {
    return NextResponse.json({ ok: true, staleMandates: 0 });
  }

  if (!gmailUser || !gmailPass) {
    // Nothing to send without email configured -- still report what would
    // have gone out so this is visible in cron logs.
    return NextResponse.json({
      ok: true,
      staleMandates: byMandate.size,
      note: "GMAIL_USER/GMAIL_APP_PASSWORD not configured -- no emails sent.",
      mandates: Array.from(byMandate.values()),
    });
  }

  for (const group of byMandate.values()) {
    // Recipients: admins (always) + this mandate's assigned recruiter(s).
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin");
    const { data: assignments } = await admin
      .from("mandate_assignments")
      .select("profiles(email)")
      .eq("mandate_id", group.mandateId);
    const assignedEmails = (assignments ?? [])
      .map((a) => (a.profiles as unknown as { email: string } | null)?.email)
      .filter((e): e is string => !!e);
    const recipients = Array.from(new Set([...(admins ?? []).map((a) => a.email), ...assignedEmails])).filter(
      (e): e is string => !!e
    );

    if (recipients.length === 0) {
      results.push({ mandate_id: group.mandateId, notified: 0, error: "No recipient emails found" });
      continue;
    }

    const maxReminders = FOLLOWUP_DAY_THRESHOLDS.length;
    const describeCandidate = (c: MandateGroup["candidates"][number]) => {
      const isLast = c.reminderNumber >= maxReminders;
      const tag = isLast
        ? `reminder ${c.reminderNumber}/${maxReminders} -- last one, no further nudges unless the stage changes`
        : `reminder ${c.reminderNumber}/${maxReminders}`;
      return `shared ${c.daysWaiting} day${c.daysWaiting === 1 ? "" : "s"} ago, ${tag}`;
    };
    const listText = group.candidates.map((c) => `- ${c.name} (${describeCandidate(c)})`).join("\n");
    const listHtml = group.candidates
      .map((c) => `<li>${c.name} <span style="color:#94a3b8">(${describeCandidate(c)})</span></li>`)
      .join("");
    const mandateUrl = `https://staffanchor-crm-claude.vercel.app/mandates/${group.mandateId}`;
    const isFinalBatch = group.candidates.every((c) => c.reminderNumber >= maxReminders);

    try {
      await sendEmail({
        to: recipients.join(","),
        subject: `Follow-up needed: ${group.clientName} hasn't responded on ${group.roleTitle}`,
        text: `${group.clientName} was shared a shortlist for ${group.roleTitle} and hasn't given feedback on:\n\n${listText}\n\nWorth a nudge: ${mandateUrl}${
          isFinalBatch
            ? "\n\nThis is the last automated reminder for these candidates (day 15) -- no more will be sent unless the stage changes."
            : ""
        }`,
        html: renderEmailShell({
          preheader: `${group.clientName} hasn't responded on ${group.roleTitle}.`,
          bodyHtml: `<p><strong>${group.clientName}</strong> was shared a shortlist for <strong>${group.roleTitle}</strong> and hasn't given feedback on:</p><ul>${listHtml}</ul><p>Worth a nudge: <a href="${mandateUrl}">${mandateUrl}</a></p>${
            isFinalBatch
              ? `<p style="color:#94a3b8">This is the last automated reminder for these candidates (day 15) -- no more will be sent unless the stage changes.</p>`
              : ""
          }`,
        }),
      });
      results.push({ mandate_id: group.mandateId, notified: recipients.length });

      // Record that this reminder went out so the next run's fresh-cycle
      // check (client_followup_last_sent_at vs stage_updated_at) and
      // threshold math both advance correctly.
      const nowIso = new Date().toISOString();
      await Promise.all(
        group.candidates.map((c) =>
          admin
            .from("candidate_mandate_links")
            .update({ client_followup_count: c.reminderNumber, client_followup_last_sent_at: nowIso })
            .eq("id", c.linkId)
        )
      );
    } catch (err) {
      results.push({
        mandate_id: group.mandateId,
        notified: 0,
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  return NextResponse.json({ ok: true, staleMandates: byMandate.size, results });
}
