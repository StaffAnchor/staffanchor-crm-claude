import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateScreeningQuestions } from "@/lib/generate-screening-questions";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json();
  const result = await generateScreeningQuestions({
    role_title: body.role_title ?? "",
    category: body.category ?? "",
    sub_domains: Array.isArray(body.sub_domains) ? body.sub_domains : [],
    sales_cycle: body.sales_cycle ?? "",
    deal_size_band: body.deal_size_band ?? "",
    customer_profile: body.customer_profile ?? "",
    jd_candidate_profile: body.jd_candidate_profile ?? "",
    must_haves: Array.isArray(body.must_haves) ? body.must_haves : [],
    team_handling: body.team_handling ?? "",
    team_size_band: body.team_size_band ?? "",
    work_mode: body.work_mode ?? "",
    cities: Array.isArray(body.cities) ? body.cities : [],
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ questions: result.questions });
}
