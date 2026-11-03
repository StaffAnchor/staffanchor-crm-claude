import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Tells each employer when new candidates were shared with them. Candidates wait WAIT_MIN minutes after being shared, so a
// batch shared in one sitting goes out as one email per role, and a candidate pulled back in that window is never announced.
// Recipients: the employer's portal users, and (only when CLIENT_SHARE_PRIMARY=on) its primary contact. Off until
// CLIENT_SHARE_EMAILS=on is set; "?dry=1" shows what would be sent, "?test=you@x.com" sends the previews to that address
// only; neither marks anything. candidate_mandate_links.client_notified_at records what was announced.
// Called every few minutes by a Supabase pg_cron job (x-tick-secret header) and once a day by Vercel as a fallback.
export const maxDuration = 60;

const WAIT_MIN = 10;
const PORTAL = "https://jobs.staffanchor.com/client-portal/mandates";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

type Row = {
  id: string;
  mandate_id: string;
  client_note: string | null;
  candidates: One<{ full_name: string | null; current_job_title: string | null; current_employer: string | null; total_experience_years: number | null }>;
  mandates: One<{ role_title: string | null; client_id: string | null; clients: One<{ name: string | null }> }>;
};

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const tick = process.env.NOTIFY_TICK_SECRET;
  const tickOk = !!tick && req.headers.get("x-tick-secret") === tick;
  if (cronSecret && !tickOk && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const testTo = req.nextUrl.searchParams.get("test");
  const live = process.env.CLIENT_SHARE_EMAILS === "on" && !dry && !testTo;
  const includePrimary = process.env.CLIENT_SHARE_PRIMARY === "on" || !!testTo;
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const { data } = await admin
    .from("candidate_mandate_links")
    .select("id, mandate_id, client_note, candidates(full_name, current_job_title, current_employer, total_experience_years), mandates(role_title, client_id, clients(name))")
    .eq("in_shortlist", true)
    .is("client_notified_at", null)
    .not("stage", "in", "(rejected,pulled_back)")
    .lte("shortlisted_at", new Date(Date.now() - WAIT_MIN * 60_000).toISOString())
    .limit(500);

  const byRole = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) byRole.set(r.mandate_id, [...(byRole.get(r.mandate_id) ?? []), r]);

  const results: { role: string; client: string | null; candidates: number; to: string[]; sent: boolean; error?: string }[] = [];
  for (const [mandateId, rows] of byRole) {
    const m = one(rows[0].mandates);
    const clientId = m?.client_id;
    const role = m?.role_title ?? "your role";
    const clientName = one(m?.clients ?? null)?.name ?? null;
    if (!clientId) continue;
    const { data: users } = await admin.from("client_users").select("email, full_name").eq("client_id", clientId);
    const portalTo = (users ?? []).map((u) => (u.email as string)?.toLowerCase()).filter(Boolean);
    let primaryTo: string[] = [];
    if (includePrimary) {
      const { data: primaries } = await admin.from("client_contacts").select("email").eq("client_id", clientId).eq("is_primary", true).not("email", "is", null);
      primaryTo = (primaries ?? []).map((c) => (c.email as string).toLowerCase()).filter((e) => e && !portalTo.includes(e));
    }
    const to = [...portalTo, ...primaryTo];
    if (to.length === 0) {
      results.push({ role, client: clientName, candidates: rows.length, to: [], sent: false, error: "No registered portal users" });
      continue;
    }

    const n = rows.length;
    const lines = rows.map((r) => {
      const c = one(r.candidates);
      const bits = [c?.current_job_title, c?.current_employer, c?.total_experience_years != null ? `${Math.round(c.total_experience_years)} yrs` : null].filter(Boolean).join(" · ");
      return { name: c?.full_name ?? "A candidate", bits, note: r.client_note?.trim() || null };
    });
    // People with a portal login get the portal; a primary contact without one gets the no-login shortlist link.
    const portalUrl = `${PORTAL}/${mandateId}`;
    let shortlistUrl: string | null = null;
    if (primaryTo.length) {
      const { data: tok } = await admin.from("shortlist_tokens").select("token").eq("mandate_id", mandateId).maybeSingle();
      let token = tok?.token as string | undefined;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
        if (live) await admin.from("shortlist_tokens").insert({ token, mandate_id: mandateId });
      }
      shortlistUrl = `https://clients.staffanchor.com/shortlist/${token}`;
    }
    const subject = n === 1 ? `New candidate shared for ${role}` : `${n} new candidates shared for ${role}`;
    const listHtml = lines.map((l) => `<li style="margin:0 0 8px"><strong>${esc(l.name)}</strong>${l.bits ? `<br><span style="color:#475569">${esc(l.bits)}</span>` : ""}${l.note ? `<br><span style="color:#92400e">Note: ${esc(l.note)}</span>` : ""}</li>`).join("");
    const build = (url: string) => ({
      html: renderEmailShell({
        preheader: subject,
        bodyHtml: `<p>Hi,</p><p>${n === 1 ? "A new candidate has" : `${n} new candidates have`} been shared with you for <strong>${esc(role)}</strong>:</p><ul style="padding-left:18px">${listHtml}</ul><p><a href="${url}" style="display:inline-block;background:#0F172A;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${url === portalUrl ? "Review in your portal" : "View the profiles"}</a></p><p style="color:#475569">You can mark each one Interested, request an interview, or pass, right from the link.</p>`,
      }),
      text: `${n === 1 ? "A new candidate has" : `${n} new candidates have`} been shared with you for ${role}:\n\n${lines.map((l) => `- ${l.name}${l.bits ? ` (${l.bits})` : ""}${l.note ? `\n  Note: ${l.note}` : ""}`).join("\n")}\n\nReview: ${url}`,
    });

    if (testTo) {
      try {
        await sendEmail({ to: testTo, subject: `[TEST] ${subject}`, ...build(shortlistUrl ?? portalUrl) });
        results.push({ role, client: clientName, candidates: n, to: [testTo], sent: true });
      } catch (err) {
        results.push({ role, client: clientName, candidates: n, to: [testTo], sent: false, error: err instanceof Error ? err.message : "send failed" });
      }
      continue;
    }
    if (!live) {
      results.push({ role, client: clientName, candidates: n, to, sent: false });
      continue;
    }
    try {
      if (portalTo.length) await sendEmail({ to: portalTo.join(","), subject, ...build(portalUrl) });
      if (primaryTo.length && shortlistUrl) await sendEmail({ to: primaryTo.join(","), subject, ...build(shortlistUrl) });
      await admin.from("candidate_mandate_links").update({ client_notified_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
      results.push({ role, client: clientName, candidates: n, to, sent: true });
    } catch (err) {
      results.push({ role, client: clientName, candidates: n, to, sent: false, error: err instanceof Error ? err.message : "send failed" });
    }
  }
  return NextResponse.json({ ok: true, live, pendingRoles: byRole.size, results });
}

export const GET = withHeartbeat("client-share-notify", 1440, handler);
