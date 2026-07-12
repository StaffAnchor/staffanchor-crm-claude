import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCareerTimelineForCandidate } from "@/lib/generate-career-timeline-from-resume";

// On-demand trigger for the "Regenerate from resume" action on a
// candidate's Career Timeline section -- the cron sweep (below) is the
// self-healing catch-all, this route just lets a recruiter force it
// immediately after uploading a fresh resume rather than waiting.
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
  const candidateId = body.candidate_id as string | undefined;
  if (!candidateId) return NextResponse.json({ error: "candidate_id is required" }, { status: 400 });

  const result = await generateCareerTimelineForCandidate(candidateId, supabase);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, skipped: result.skipped ?? false, entries: result.entries ?? [] });
}
