import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lastTwoRoles, type LastRole } from "@/lib/last-roles";
import { skillsFromFacts, type Skill } from "@/lib/card-skills";

export const runtime = "nodejs";

export type CardFacts = { skills: Skill[]; roles: LastRole[]; education: { degree: string | null; institution: string | null; year: string | null }[] };

// What a candidate card shows beyond the basics, for many people at once: key skills, the last two jobs and the degrees,
// all read from the structured CV facts. The role text (optional) puts the skills that match the role first.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; roleText?: unknown };
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 80);
  if (ids.length === 0) return NextResponse.json({ facts: {} });
  const roleText = typeof body.roleText === "string" ? body.roleText.slice(0, 600) : null;

  const [{ data: factRows }, { data: people }] = await Promise.all([
    supabase.from("candidate_cv_facts").select("candidate_id, facts").in("candidate_id", ids),
    supabase.from("candidates").select("id, profile_group, sub_domain, career_timeline_profile, career_timeline_resume").in("id", ids),
  ]);
  const factsOf = new Map(((factRows ?? []) as { candidate_id: string; facts: Record<string, unknown> | null }[]).map((r) => [r.candidate_id, r.facts]));
  const facts: Record<string, CardFacts> = {};
  for (const p of (people ?? []) as { id: string; profile_group: string | null; sub_domain: string | null; career_timeline_profile: unknown; career_timeline_resume: unknown }[]) {
    const f = (factsOf.get(p.id) ?? null) as (Record<string, unknown> & { roles?: unknown; education?: unknown }) | null;
    const edu = Array.isArray(f?.education) ? (f!.education as CardFacts["education"]).filter((e) => e && (e.degree || e.institution)).slice(0, 2) : [];
    facts[p.id] = {
      skills: skillsFromFacts(f as never, p, roleText),
      roles: lastTwoRoles(f?.roles, p.career_timeline_profile, p.career_timeline_resume),
      education: edu,
    };
  }
  return NextResponse.json({ facts });
}
