import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Tells each employer's registered portal users when new candidates were shared with them. One email per role per day, so
// ten candidates shared in a morning is one message, not ten. Off until CLIENT_SHARE_EMAILS=on is set; "?dry=1" shows what
// would be sent without sending or marking anything. candidate_mandate_links.client_notified_at records what was announced.
export const maxDuration = 60;

const PORTAL = "https://jobs.staffanchor.com/client-portal/mandates";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

type Row = {
  id: string;
  mandate_id: string;
  candidates: One<{ full_name: string | null; current_job_title: string | null; current_employer: string | null; total_experience_years: number | null }>;
  mandates: One<{ role_title: string | null; client_id: string | null; clients: One<{ name: string | null }> }>;
};

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const live = process.env.CLIENT_SHARE_EMAILS === "on" && !dry;
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const { data } = await admin
    .from("candidate_mandate_links")
    .select("id, mandate_id, candidates(full_name, current_job_title, current_employer, total_experience_years), mandates(role_title, client_id, clients(name))")
    .eq("in_shortlist", true)
    .is("client_notified_at", null)
    .not("stage", "in", "(rejected,pulled_back)")
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
    const to = (users ?? []).map((u) => u.email as string).filter(Boolean);
    if (to.length === 0) {
      results.push({ role, client: clientName, candidates: rows.length, to: [], sent: false, error: "No registered portal users" });
      continue;
    }

    const n = rows.length;
    const lines = rows.map((r) => {
      const c = one(r.candidates);
      const bits = [c?.current_job_title, c?.current_employer, c?.total_experience_years != null ? `${Math.round(c.total_experience_years)} yrs` : null].filter(Boolean).join(" · ");
      return { name: c?.full_name ?? "A candidate", bits };
    });
    const url = `${PORTAL}/${mandateId}`;
    const subject = n === 1 ? `New candidate shared for ${role}` : `${n} new candidates shared for ${role}`;
    const listHtml = lines.map((l) => `<li style="margin:0 0 8px"><strong>${esc(l.name)}</strong>${l.bits ? `<br><span style="color:#475569">${esc(l.bits)}</span>` : ""}</li>`).join("");
    const html = renderEmailShell({
      preheader: subject,
      bodyHtml: `<p>Hi,</p><p>${n === 1 ? "A new candidate has" : `${n} new candidates have`} been shared with you for <strong>${esc(role)}</strong>:</p><ul style="padding-left:18px">${listHtml}</ul><p><a href="${url}" style="display:inline-block;background:#0F172A;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Review in your portal</a></p><p style="color:#475569">You can mark each one Interested, request an interview, or pass, right from the portal.</p>`,
    });
    const text = `${n === 1 ? "A new candidate has" : `${n} new candidates have`} been shared with you for ${role}:\n\n${lines.map((l) => `- ${l.name}${l.bits ? ` (${l.bits})` : ""}`).join("\n")}\n\nReview in your portal: ${url}`;

    if (!live) {
      results.push({ role, client: clientName, candidates: n, to, sent: false });
      continue;
    }
    try {
      await sendEmail({ to: to.join(","), subject, html, text });
      await admin.from("candidate_mandate_links").update({ client_notified_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
      results.push({ role, client: clientName, candidates: n, to, sent: true });
    } catch (err) {
      results.push({ role, client: clientName, candidates: n, to, sent: false, error: err instanceof Error ? err.message : "send failed" });
    }
  }
  return NextResponse.json({ ok: true, live, pendingRoles: byRole.size, results });
}

export const GET = withHeartbeat("client-share-notify", 1440, handler);
