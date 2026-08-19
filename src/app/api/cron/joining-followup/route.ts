import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Daily digest: a joining date was captured (at Offer or Placed), but
// nothing ever followed up on whether the candidate actually joined --
// gap #4 from the July 2026 audit. Mirrors cron/client-followup's shape:
// one email per mandate to its assigned recruiters + admins, grouping
// candidates whose date_of_joining has arrived or passed but the link is
// still not at "placed" (i.e., nobody has confirmed the join actually
// happened), plus a lighter heads-up for joins landing in the next 3 days.
export const maxDuration = 60;

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

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const upcomingCutoff = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Everything with a joining date set, that isn't already at "placed" (a
  // recruiter confirming Placed is itself the confirmation the join
  // happened -- this digest only chases what's still open).
  const { data: links, error } = await admin
    .from("candidate_mandate_links")
    .select("id, date_of_joining, stage, mandate_id, candidates(full_name), mandates(id, role_title, client_name)")
    .not("date_of_joining", "is", null)
    .neq("stage", "placed")
    .lte("date_of_joining", upcomingCutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Item = { name: string; date: string; overdue: boolean };
  type MandateGroup = { mandateId: string; roleTitle: string; clientName: string; items: Item[] };
  const byMandate = new Map<string, MandateGroup>();
  for (const link of links ?? []) {
    const mandate = link.mandates as unknown as { id: string; role_title: string; client_name: string } | null;
    const candidate = link.candidates as unknown as { full_name: string } | null;
    const dateOfJoining = link.date_of_joining as string | null;
    if (!mandate || !candidate || !dateOfJoining) continue;
    const item: Item = { name: candidate.full_name, date: dateOfJoining, overdue: dateOfJoining <= todayStr };
    const existing = byMandate.get(mandate.id);
    if (existing) existing.items.push(item);
    else byMandate.set(mandate.id, { mandateId: mandate.id, roleTitle: mandate.role_title, clientName: mandate.client_name, items: [item] });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const results: { mandate_id: string; notified: number; error?: string }[] = [];

  if (byMandate.size === 0) {
    return NextResponse.json({ ok: true, mandatesWithJoiners: 0 });
  }

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({
      ok: true,
      mandatesWithJoiners: byMandate.size,
      note: "GMAIL_USER/GMAIL_APP_PASSWORD not configured -- no emails sent.",
      mandates: Array.from(byMandate.values()),
    });
  }

  for (const group of byMandate.values()) {
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

    const describe = (i: Item) =>
      i.overdue
        ? `${i.name} -- was due to join ${new Date(i.date).toLocaleDateString()} (confirm or update stage)`
        : `${i.name} -- joining ${new Date(i.date).toLocaleDateString()}`;
    const listText = group.items.map((i) => `- ${describe(i)}`).join("\n");
    const listHtml = group.items
      .map((i) => `<li${i.overdue ? ' style="color:#b91c1c"' : ""}>${describe(i)}</li>`)
      .join("");
    const mandateUrl = `https://staffanchor-crm-claude.vercel.app/mandates/${group.mandateId}`;

    try {
      await sendEmail({
        to: recipients.join(","),
        subject: `Joining follow-up: ${group.clientName} — ${group.roleTitle}`,
        text: `Joining dates to confirm for ${group.roleTitle} at ${group.clientName}:\n\n${listText}\n\n${mandateUrl}`,
        html: renderEmailShell({
          preheader: `Joining dates to confirm for ${group.roleTitle} at ${group.clientName}.`,
          bodyHtml: `<p>Joining dates to confirm for <strong>${group.roleTitle}</strong> at <strong>${group.clientName}</strong>:</p><ul>${listHtml}</ul><p><a href="${mandateUrl}">${mandateUrl}</a></p>`,
        }),
      });
      results.push({ mandate_id: group.mandateId, notified: recipients.length });
    } catch (err) {
      results.push({ mandate_id: group.mandateId, notified: 0, error: err instanceof Error ? err.message : "send failed" });
    }
  }

  return NextResponse.json({ ok: true, mandatesWithJoiners: byMandate.size, results });
}

export const GET = withHeartbeat("joining-followup", 1440, handler);
