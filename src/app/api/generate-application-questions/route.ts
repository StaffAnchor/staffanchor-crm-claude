import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApplicationQuestions } from "@/lib/generate-application-questions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The questions to ask candidates when they apply: the basics first, then a few simple ones from the job description.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  if (!b.role_title) return NextResponse.json({ error: "Save the role title first." }, { status: 400 });
  const r = await generateApplicationQuestions({
    role_title: String(b.role_title),
    category: b.category ?? null,
    sub_domains: arr(b.sub_domains),
    must_haves: arr(b.must_haves),
    good_to_haves: arr(b.good_to_haves),
    cities: arr(b.cities),
    work_mode: b.work_mode ?? null,
    working_days: b.working_days ?? null,
    shift_timing: b.shift_timing ?? null,
    requires_own_device: Boolean(b.requires_own_device),
    jd_overview: b.jd_overview ?? null,
    jd_candidate_profile: b.jd_candidate_profile ?? null,
    sales_cycle: b.sales_cycle ?? null,
    deal_size_band: b.deal_size_band ?? null,
  });
  return NextResponse.json(r);
}
