import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { draftRoleSpec, type RoleForSpec } from "@/lib/draft-role-spec";

// Suggests must-haves / good-to-haves from the role's JD. Read-only: it
// returns a draft and saves nothing; the recruiter confirms in the panel.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { data: mandate, error } = await supabase
    .from("mandates")
    .select(
      "id, role_title, category, sub_domains, cities, experience_min, experience_max, budget_min, budget_max, job_description, jd_overview, jd_responsibilities, jd_candidate_profile, jd_compensation_benefits, notes"
    )
    .eq("id", id)
    .single();
  if (error || !mandate) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const result = await draftRoleSpec(mandate as RoleForSpec);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.draft);
}
