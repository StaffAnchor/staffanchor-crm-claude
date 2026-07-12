import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMandateDiscussionSummary } from "@/lib/generate-mandate-discussion-summary";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "freelancer"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json();
  const qaPairs = Array.isArray(body.qa_pairs) ? body.qa_pairs : [];

  const result = await generateMandateDiscussionSummary({
    role_title: body.role_title ?? "",
    client_name: body.client_name ?? "",
    candidate_name: body.candidate_name ?? "",
    qa_pairs: qaPairs,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ summary: result.summary, tags: result.tags });
}
