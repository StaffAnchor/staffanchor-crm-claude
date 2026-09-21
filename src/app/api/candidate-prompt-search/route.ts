import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchCandidatesForPrompt } from "@/lib/candidate-match";

// Global "prompt window" search -- a recruiter types a free-text ask
// ("B2B SaaS AEs in Bangalore, 4-7 years, hunting not farming") and gets
// ranked candidates back from the WHOLE database, with no mandate
// attached. Distinct from /api/mandate-match, which scores against one
// mandate's JD/must-haves.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { prompt, practiceId } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const result = await matchCandidatesForPrompt(prompt, supabase, {
    practiceId: typeof practiceId === "string" && practiceId ? practiceId : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Batch-generate resume signed URLs for the returned matches in one
  // Storage API call (same pattern as the mandate detail page and Practice
  // Pool) so results can show an inline "Preview CV" action without a
  // per-row request -- a recruiter scanning prompt-search results
  // shouldn't have to open each candidate's profile just to glance at
  // their CV.
  const resumePaths = Array.from(
    new Set(
      result.matches
        .map((m) => m.resume_file_url)
        .filter((p): p is string => Boolean(p))
        .map((p) => p.replace(/^resumes\//, ""))
    )
  );
  const resumeUrlByPath: Record<string, string> = {};
  if (resumePaths.length > 0) {
    const { data: signedBatch } = await supabase.storage.from("resumes").createSignedUrls(resumePaths, 60 * 60 * 12);
    (signedBatch ?? []).forEach((s) => {
      if (s.signedUrl && !s.error && s.path) resumeUrlByPath[s.path] = s.signedUrl;
    });
  }
  const matches = result.matches.map((m) => ({
    ...m,
    resume_signed_url: m.resume_file_url ? resumeUrlByPath[m.resume_file_url.replace(/^resumes\//, "")] ?? null : null,
  }));

  return NextResponse.json({ matches, scanned: result.scanned });
}
