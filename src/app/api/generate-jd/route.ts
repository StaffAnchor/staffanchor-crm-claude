import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJdFromNotes } from "@/lib/generate-jd";

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
  const result = await generateJdFromNotes({
    role_title: body.role_title ?? "",
    category: body.category ?? "",
    sub_domains: Array.isArray(body.sub_domains) ? body.sub_domains : [],
    cities: Array.isArray(body.cities) ? body.cities : [],
    experience_min: body.experience_min ?? "",
    experience_max: body.experience_max ?? "",
    budget_min: body.budget_min ?? "",
    budget_max: body.budget_max ?? "",
    raw_notes: body.raw_notes ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.jd);
}
