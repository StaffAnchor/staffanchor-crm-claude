import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Weekly: reads what recruiters wrote and chose when they rejected people, and tells the admin where the reason list or the
// habits around it should improve. In-app only (the bell); nothing is sent outside the team.
export const maxDuration = 60;

const THEMES: { key: string; label: string; re: RegExp; reason: string }[] = [
  { key: "stability", label: "stability / job hopping", re: /hopp|stabil|frequent(ly)? chang|short stint|many jobs/i, reason: "stability_concern" },
  { key: "too_senior", label: "too senior / overqualified", re: /over.?qualif|too senior|too high exp|exp(erience)?.{0,20}(very )?high|senior for/i, reason: "overqualified" },
  { key: "too_junior", label: "too junior", re: /too junior|low exp|not enough exp|fresher/i, reason: "underqualified" },
  { key: "background", label: "wrong industry / background", re: /edtech|service (company|background)|not from|background|domain|industry/i, reason: "domain_mismatch" },
  { key: "salary", label: "pay", re: /\blpa\b|\blakh|salary|ctc|budget|expect/i, reason: "salary_mismatch" },
  { key: "location", label: "location", re: /location|relocat|city|based in/i, reason: "location_mismatch" },
];

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: rows } = await admin
    .from("candidate_mandate_links")
    .select("rejection_category, rejection_reason, stage, candidates(stability_score)")
    .in("stage", ["rejected"])
    .gte("stage_updated_at", since)
    .limit(2000);
  const rej = (rows ?? []) as unknown as { rejection_category: string | null; rejection_reason: string | null; candidates: { stability_score: number | null } | { stability_score: number | null }[] | null }[];
  if (rej.length < 5) return NextResponse.json({ ok: true, skipped: "not enough rejections yet" });

  const stab = (r: (typeof rej)[number]) => {
    const c = Array.isArray(r.candidates) ? r.candidates[0] : r.candidates;
    return c?.stability_score != null ? Number(c.stability_score) : null;
  };
  const lines: string[] = [];

  const noReason = rej.filter((r) => !r.rejection_category).length;
  if (noReason > 0) lines.push(`${noReason} of ${rej.length} rejections in the last 60 days have no reason recorded.`);

  const hidden = rej.filter((r) => (stab(r) ?? 100) < 40 && r.rejection_category && r.rejection_category !== "stability_concern").length;
  if (hidden >= 3) lines.push(`${hidden} people with a very low stability score were rejected under another reason (mostly "skills mismatch"). Stability is probably the real reason; the new "Stability: frequent job changes" option is there for it.`);

  const vague = rej.filter((r) => r.rejection_category === "other_internal" || r.rejection_category === "other_client").length;
  if (vague >= 3) lines.push(`${vague} rejections used "Other". Read the notes on them: a repeating reason deserves its own option.`);

  // A note that clearly describes one reason but sits under another.
  const misfiled: Record<string, number> = {};
  for (const r of rej) {
    const text = (r.rejection_reason ?? "").trim();
    if (!text) continue;
    const t = THEMES.find((th) => th.re.test(text));
    if (t && r.rejection_category && r.rejection_category !== t.reason && !(t.key === "salary" && r.rejection_category === "salary_mismatch")) misfiled[t.label] = (misfiled[t.label] ?? 0) + 1;
  }
  for (const [label, n] of Object.entries(misfiled)) if (n >= 2) lines.push(`${n} notes talk about ${label} but were filed under a different reason.`);

  const cvOnly = rej.filter((r) => /^CV only/i.test(r.rejection_reason ?? "")).length;
  const afterCall = rej.filter((r) => /^After a call/i.test(r.rejection_reason ?? "")).length;
  if (cvOnly + afterCall >= 5) lines.push(`${Math.round((cvOnly / (cvOnly + afterCall)) * 100)}% of recent rejections were made from the CV alone. Worth a short call on the borderline ones before passing.`);

  if (lines.length === 0) return NextResponse.json({ ok: true, suggestions: 0 });

  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const recent = new Date(Date.now() - 6 * 86_400_000).toISOString();
  let sent = 0;
  for (const a of (admins ?? []) as { id: string }[]) {
    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", a.id).eq("type", "system_suggestion").gte("created_at", recent);
    if ((count ?? 0) > 0) continue;
    await admin.from("notifications").insert({ user_id: a.id, type: "system_suggestion", title: "Rejection review: ways to improve", body: lines.slice(0, 5).join(" "), link: "/analytics/reports" });
    sent++;
  }
  return NextResponse.json({ ok: true, suggestions: lines.length, notified: sent });
}

export const GET = withHeartbeat("rejection-review", 7 * 24 * 60, handler);
