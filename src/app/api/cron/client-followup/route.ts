import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const STALE_DAYS = 4;

// Daily digest: nudges staff when a client has sat on a shared shortlist
// for STALE_DAYS+ with no feedback recorded on any of the candidates in it.
// Recruiters previously had to remember to chase this manually -- easy to
// let a pipeline go quiet once a shortlist is shared and attention moves
// on to the next mandate. One email per mandate that has gone stale,
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

  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Every shortlisted-but-unresponded link older than the cutoff, joined to
  // its mandate and candidate for the digest text.
  const { data: staleLinks, error } = await admin
    .from("candidate_mandate_links")
    .select(
      "id, shortlisted_at, mandate_id, candidates(full_name), mandates(id, role_title, client_name)"
    )
    .eq("in_shortlist", true)
    .is("client_feedback", null)
    .lt("shortlisted_at", staleCutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type MandateGroup = {
    mandateId: string;
    roleTitle: string;
    clientName: string;
    candidates: { name: string; daysWaiting: number }[];
  };
  const byMandate = new Map<string, MandateGroup>();
  for (const link of staleLinks ?? []) {
    const mandate = link.mandates as unknown as { id: string; role_title: string; client_name: string } | null;
    const candidate = link.candidates as unknown as { full_name: string } | null;
    if (!mandate || !candidate) continue;
    const daysWaiting = Math.floor(
      (Date.now() - new Date(link.shortlisted_at as string).getTime()) / (24 * 60 * 60 * 1000)
    );
    const existing = byMandate.get(mandate.id);
    if (existing) {
      existing.candidates.push({ name: candidate.full_name, daysWaiting });
    } else {
      byMandate.set(mandate.id, {
        mandateId: mandate.id,
        roleTitle: mandate.role_title,
        clientName: mandate.client_name,
        candidates: [{ name: candidate.full_name, daysWaiting }],
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

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });

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

    const listText = group.candidates
      .map((c) => `- ${c.name} (shared ${c.daysWaiting} day${c.daysWaiting === 1 ? "" : "s"} ago)`)
      .join("\n");
    const listHtml = group.candidates
      .map((c) => `<li>${c.name} <span style="color:#94a3b8">(shared ${c.daysWaiting} day${c.daysWaiting === 1 ? "" : "s"} ago)</span></li>`)
      .join("");
    const mandateUrl = `https://staffanchor-crm-claude.vercel.app/mandates/${group.mandateId}`;

    try {
      await transporter.sendMail({
        from: `"StaffAnchor CRM" <${gmailUser}>`,
        to: recipients.join(","),
        subject: `Follow-up needed: ${group.clientName} hasn't responded on ${group.roleTitle}`,
        text: `${group.clientName} was shared a shortlist for ${group.roleTitle} and hasn't given feedback on:\n\n${listText}\n\nWorth a nudge: ${mandateUrl}`,
        html: `<p><strong>${group.clientName}</strong> was shared a shortlist for <strong>${group.roleTitle}</strong> and hasn't given feedback on:</p><ul>${listHtml}</ul><p>Worth a nudge: <a href="${mandateUrl}">${mandateUrl}</a></p>`,
      });
      results.push({ mandate_id: group.mandateId, notified: recipients.length });
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
