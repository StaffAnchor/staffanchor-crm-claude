import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { passReasonLabel } from "@/lib/pass-reasons";

// Emails the owner when a client shortlists ("interested") or passes on a candidate in the client portal.
// candidate_mandate_links.client_decision_emailed holds the answer last announced, so each decision is sent once and a
// change of mind is sent again. One email per run, however many decisions arrived. Recipient: CLIENT_DECISION_EMAIL_TO
// (default gagan@staffanchor.com). "?dry=1" lists what would be sent and marks nothing; "CLIENT_DECISION_EMAILS=off" pauses it.
// Called every few minutes by a Supabase pg_cron job (x-tick-secret header) and once a day by Vercel as a fallback.
export const maxDuration = 60;

const CRM = "https://clients.staffanchor.com";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

type Row = {
  id: string;
  mandate_id: string;
  client_feedback: "interested" | "not_interested";
  client_pass_reason: string | null;
  client_pass_note: string | null;
  client_decision_at: string | null;
  candidates: One<{ full_name: string | null; current_job_title: string | null; current_employer: string | null; total_experience_years: number | null }>;
  mandates: One<{ role_title: string | null; client_name: string | null }>;
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
  if (process.env.CLIENT_DECISION_EMAILS === "off" && !dry) return NextResponse.json({ ok: true, paused: true });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  // One query per answer, because PostgREST cannot compare two columns: "not announced yet, or announced as something else".
  const SELECT = "id, mandate_id, client_feedback, client_pass_reason, client_pass_note, client_decision_at, candidates(full_name, current_job_title, current_employer, total_experience_years), mandates(role_title, client_name)";
  const pending = await Promise.all((["interested", "not_interested"] as const).map((answer) =>
    admin.from("candidate_mandate_links").select(SELECT).eq("client_feedback", answer).or(`client_decision_emailed.is.null,client_decision_emailed.neq.${answer}`).limit(100),
  ));
  const rows = pending.flatMap((p) => (p.data ?? []) as unknown as Row[]).sort((x, y) => (x.client_decision_at ?? "").localeCompare(y.client_decision_at ?? ""));
  if (rows.length === 0) return NextResponse.json({ ok: true, pending: 0 });

  const line = (r: Row) => {
    const c = one(r.candidates);
    const m = one(r.mandates);
    const passed = r.client_feedback === "not_interested";
    const bits = [c?.current_job_title, c?.current_employer, c?.total_experience_years != null ? `${Math.round(c.total_experience_years)} yrs` : null].filter(Boolean).join(" · ");
    const reason = passed ? passReasonLabel(r.client_pass_reason) ?? (r.client_pass_reason ? r.client_pass_reason.replace(/_/g, " ") : "No reason given") : null;
    return { passed, name: c?.full_name ?? "A candidate", bits, role: m?.role_title ?? "a role", client: m?.client_name ?? "the client", reason, note: r.client_pass_note?.trim() || null, link: `${CRM}/mandates/${r.mandate_id}` };
  };
  const lines = rows.map(line);
  const shortlisted = lines.filter((l) => !l.passed).length;
  const passed = lines.length - shortlisted;
  const subject = lines.length === 1
    ? `${lines[0].client} ${lines[0].passed ? "passed on" : "shortlisted"} ${lines[0].name} for ${lines[0].role}`
    : `Client decisions: ${[shortlisted ? `${shortlisted} shortlisted` : null, passed ? `${passed} passed` : null].filter(Boolean).join(", ")}`;

  const items = lines.map((l) => `<li style="margin:0 0 14px"><strong>${esc(l.name)}</strong> <span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;${l.passed ? "background:#FFE4E6;color:#BE123C" : "background:#D1FAE5;color:#047857"}">${l.passed ? "Passed" : "Shortlisted"}</span>${l.bits ? `<br><span style="color:#475569">${esc(l.bits)}</span>` : ""}<br><span style="color:#475569">${esc(l.role)} at ${esc(l.client)}</span>${l.reason ? `<br><span style="color:#BE123C"><strong>Why:</strong> ${esc(l.reason)}${l.note ? ` &ndash; &ldquo;${esc(l.note)}&rdquo;` : ""}</span>` : ""}<br><a href="${l.link}" style="color:#0F766E">Open the role</a></li>`).join("");
  const html = renderEmailShell({ preheader: subject, bodyHtml: `<p>${lines.length === 1 ? "A client just decided on a candidate:" : "Clients decided on these candidates:"}</p><ul style="padding-left:18px;margin:0">${items}</ul>` });
  const text = lines.map((l) => `${l.name} (${l.passed ? "PASSED" : "SHORTLISTED"}) - ${l.role} at ${l.client}${l.reason ? `\n  Why: ${l.reason}${l.note ? ` - "${l.note}"` : ""}` : ""}\n  ${l.link}`).join("\n\n");

  if (dry) return NextResponse.json({ ok: true, dry: true, subject, count: lines.length, lines });
  const to = process.env.CLIENT_DECISION_EMAIL_TO || "gagan@staffanchor.com";
  try {
    await sendEmail({ to, subject, html, text });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "send failed" }, { status: 502 });
  }
  // Mark each one with the answer just announced.
  for (const r of rows) await admin.from("candidate_mandate_links").update({ client_decision_emailed: r.client_feedback }).eq("id", r.id);
  return NextResponse.json({ ok: true, sent: lines.length, to });
}

export const GET = withHeartbeat("client-decision-notify", 1440, handler);
