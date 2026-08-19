import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Weekly digest: gap #5 from the July 2026 audit. An invited client who
// never logs into the portal (or stopped logging in) was previously
// invisible to recruiters -- last_login_at is now stamped on every
// get_or_create_my_client_user() call (see the client-login RPC), so this
// sweep can flag anyone invited 7+ days ago who has never logged in, or
// who hasn't logged in for 14+ days.
export const maxDuration = 60;

const NEVER_LOGGED_IN_AFTER_DAYS = 7;
const STALE_LOGIN_AFTER_DAYS = 14;

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

  const neverCutoff = new Date(Date.now() - NEVER_LOGGED_IN_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const staleCutoff = new Date(Date.now() - STALE_LOGIN_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: clientUsers, error } = await admin
    .from("client_users")
    .select("id, email, full_name, client_id, created_at, last_login_at, clients(id, name)");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Flag = { email: string; fullName: string | null; reason: "never_logged_in" | "stale"; days: number };
  type ClientGroup = { clientId: string; clientName: string; flags: Flag[] };
  const byClient = new Map<string, ClientGroup>();

  for (const cu of clientUsers ?? []) {
    const client = cu.clients as unknown as { id: string; name: string } | null;
    if (!client) continue;
    let flag: Flag | null = null;
    if (!cu.last_login_at && cu.created_at < neverCutoff) {
      const days = Math.floor((Date.now() - new Date(cu.created_at).getTime()) / (24 * 60 * 60 * 1000));
      flag = { email: cu.email, fullName: cu.full_name, reason: "never_logged_in", days };
    } else if (cu.last_login_at && cu.last_login_at < staleCutoff) {
      const days = Math.floor((Date.now() - new Date(cu.last_login_at).getTime()) / (24 * 60 * 60 * 1000));
      flag = { email: cu.email, fullName: cu.full_name, reason: "stale", days };
    }
    if (!flag) continue;
    const existing = byClient.get(client.id);
    if (existing) existing.flags.push(flag);
    else byClient.set(client.id, { clientId: client.id, clientName: client.name, flags: [flag] });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const results: { client_id: string; notified: number; error?: string }[] = [];

  if (byClient.size === 0) {
    return NextResponse.json({ ok: true, inactiveClients: 0 });
  }

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({
      ok: true,
      inactiveClients: byClient.size,
      note: "GMAIL_USER/GMAIL_APP_PASSWORD not configured -- no emails sent.",
      clients: Array.from(byClient.values()),
    });
  }

  for (const group of byClient.values()) {
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin");
    const { data: mandates } = await admin.from("mandates").select("id").eq("client_id", group.clientId);
    const mandateIds = (mandates ?? []).map((m) => m.id);
    const { data: assignments } = mandateIds.length
      ? await admin.from("mandate_assignments").select("profiles(email)").in("mandate_id", mandateIds)
      : { data: [] as { profiles: { email: string } | null }[] };
    const assignedEmails = (assignments ?? [])
      .map((a) => (a.profiles as unknown as { email: string } | null)?.email)
      .filter((e): e is string => !!e);
    const recipients = Array.from(new Set([...(admins ?? []).map((a) => a.email), ...assignedEmails])).filter(
      (e): e is string => !!e
    );
    if (recipients.length === 0) {
      results.push({ client_id: group.clientId, notified: 0, error: "No recipient emails found" });
      continue;
    }

    const describe = (f: Flag) =>
      f.reason === "never_logged_in"
        ? `${f.fullName ?? f.email} (${f.email}) -- invited ${f.days} days ago, never logged in`
        : `${f.fullName ?? f.email} (${f.email}) -- hasn't logged in for ${f.days} days`;
    const listText = group.flags.map((f) => `- ${describe(f)}`).join("\n");
    const listHtml = group.flags.map((f) => `<li>${describe(f)}</li>`).join("");

    try {
      await sendEmail({
        to: recipients.join(","),
        subject: `Client portal inactivity: ${group.clientName}`,
        text: `${group.clientName}'s portal contacts have gone quiet:\n\n${listText}\n\nWorth a check-in call.`,
        html: renderEmailShell({
          preheader: `${group.clientName}'s portal contacts have gone quiet.`,
          bodyHtml: `<p><strong>${group.clientName}</strong>'s portal contacts have gone quiet:</p><ul>${listHtml}</ul><p>Worth a check-in call.</p>`,
        }),
      });
      results.push({ client_id: group.clientId, notified: recipients.length });
    } catch (err) {
      results.push({ client_id: group.clientId, notified: 0, error: err instanceof Error ? err.message : "send failed" });
    }
  }

  return NextResponse.json({ ok: true, inactiveClients: byClient.size, results });
}

export const GET = withHeartbeat("client-portal-inactivity", 10080, handler);
