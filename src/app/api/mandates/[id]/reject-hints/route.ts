import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Hint = { value: string; label: string; evidence: string; strength: 1 | 2 };

// What the CV and the role already say about why this person may not fit, so the reject window can suggest the reason
// (with the evidence) instead of leaving it to memory. Many rejections are made from the CV without speaking to the
// person; this also says whether anyone has spoken to them.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { id } = await ctx.params;
  const candidateId = new URL(req.url).searchParams.get("candidateId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return NextResponse.json({ error: "Missing person" }, { status: 400 });

  const [{ data: c }, { data: m }, { data: link }, { count: calls }, { count: debriefs }, { data: past }] = await Promise.all([
    supabase.from("candidates").select("stability_score, total_experience_years, expected_fixed_ctc, current_fixed_ctc, current_location, open_to_relocation").eq("id", candidateId).maybeSingle(),
    supabase.from("mandates").select("experience_min, experience_max, budget_max, city, cities").eq("id", id).maybeSingle(),
    supabase.from("candidate_mandate_links").select("match_score_breakdown").eq("mandate_id", id).eq("candidate_id", candidateId).maybeSingle(),
    supabase.from("call_log").select("id", { count: "exact", head: true }).eq("candidate_id", candidateId).eq("outcome", "reached"),
    supabase.from("candidate_debriefs").select("id", { count: "exact", head: true }).eq("candidate_id", candidateId),
    supabase.from("candidate_mandate_links").select("rejection_category").not("rejection_category", "is", null).limit(2000),
  ]);

  const hints: Hint[] = [];
  const add = (h: Hint) => {
    if (!hints.some((x) => x.value === h.value)) hints.push(h);
  };

  const stab = c?.stability_score != null ? Number(c.stability_score) : null;
  if (stab != null && stab < 50) add({ value: "stability_concern", label: "Stability: frequent job changes", evidence: `Stability score ${Math.round(stab)}/100 from the CV (short stints).`, strength: stab < 40 ? 2 : 1 });

  const exp = c?.total_experience_years != null ? Number(c.total_experience_years) : null;
  const lo = m?.experience_min != null ? Number(m.experience_min) : null;
  const hi = m?.experience_max != null ? Number(m.experience_max) : null;
  if (exp && exp > 0) {
    if (hi != null && exp > hi + 2) add({ value: "overqualified", label: "Too senior / overqualified", evidence: `${exp} years of experience; the role asks ${lo ?? 0}-${hi}.`, strength: exp > hi + 4 ? 2 : 1 });
    if (lo != null && exp < lo - 2) add({ value: "underqualified", label: "Too junior / not enough experience", evidence: `${exp} years of experience; the role asks ${lo}-${hi ?? "+"}.`, strength: exp < lo - 3 ? 2 : 1 });
  }

  const budget = m?.budget_max != null ? Number(m.budget_max) : null;
  const pay = c?.expected_fixed_ctc != null ? Number(c.expected_fixed_ctc) : c?.current_fixed_ctc != null ? Number(c.current_fixed_ctc) : null;
  if (budget && pay && pay > budget + Math.max(2, budget * 0.1)) add({ value: "salary_mismatch", label: "Salary expectation mismatch", evidence: `Expects ${pay} LPA; the budget is ${budget} LPA.`, strength: pay > budget * 1.25 ? 2 : 1 });

  const cities = [...((m?.cities as string[] | null) ?? []), ...(m?.city ? [m.city as string] : [])].map((x) => x.toLowerCase().split(/[\s(,]/)[0]).filter(Boolean);
  const where = (c?.current_location as string | null)?.toLowerCase() ?? "";
  if (cities.length && where && !cities.some((x) => where.includes(x)) && c?.open_to_relocation !== "Yes") add({ value: "location_mismatch", label: "Location/work-mode mismatch", evidence: `Based in ${c?.current_location}; the role is in ${[...new Set(((m?.cities as string[] | null) ?? []).concat(m?.city ? [m.city as string] : []))].join(", ")}.`, strength: 1 });

  // The ranking's own reasons, when this person was scored against the role.
  const gaps = (((link?.match_score_breakdown as { gaps?: string[] } | null)?.gaps) ?? []).join(" | ");
  if (/What they sell is not close|nearby world/i.test(gaps)) add({ value: "domain_mismatch", label: "Not from the required industry or background", evidence: gaps.match(/What they sell is not close|Sells in a nearby world \([^)]*\)/i)?.[0] ?? "Sells in a different space from the role.", strength: /not close/i.test(gaps) ? 2 : 1 });
  if (/Role is close but not the same|Did this job before/i.test(gaps)) add({ value: "skills_mismatch", label: "Skills/experience mismatch", evidence: gaps.match(/Role is close but not the same[^|]*|Did this job before[^|]*/i)?.[0]?.trim() ?? "The current job is not the one asked for.", strength: 1 });

  hints.sort((a, b) => b.strength - a.strength);

  const usage: Record<string, number> = {};
  for (const r of (past ?? []) as { rejection_category: string }[]) usage[r.rejection_category] = (usage[r.rejection_category] ?? 0) + 1;

  return NextResponse.json({ hints: hints.slice(0, 4), spoken: (calls ?? 0) + (debriefs ?? 0) > 0, usage });
}
