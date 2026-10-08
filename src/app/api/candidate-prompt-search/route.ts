import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCandidates, seedFromMandate } from "@/lib/prompt-search";
import { sanitizeSpec, type SearchSpec } from "@/lib/search-spec";

export const maxDuration = 120;

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

  const body = (await req.json().catch(() => ({}))) as { prompt?: string; practiceId?: string; mandateId?: string; spec?: unknown };
  let prompt = typeof body.prompt === "string" ? body.prompt : "";
  let spec: SearchSpec | undefined = body.spec ? sanitizeSpec(body.spec) : undefined;
  let embeddingText: string | undefined;
  const mandateId = typeof body.mandateId === "string" && body.mandateId ? body.mandateId : undefined;

  // Searching for a mandate: its place, experience, budget and must-haves become the starting search.
  if (mandateId) {
    const { data: m } = await supabase
      .from("mandates")
      .select("role_title, sub_domain, city, cities, experience_min, experience_max, budget_max, must_haves, good_to_haves, selling_style, jd_overview")
      .eq("id", mandateId)
      .maybeSingle();
    if (!m) return NextResponse.json({ error: "Mandate not found" }, { status: 404 });
    const seed = seedFromMandate(m as Parameters<typeof seedFromMandate>[0]);
    if (!prompt.trim()) prompt = seed.prompt;
    if (!spec) spec = seed.spec;
    embeddingText = seed.embeddingText;
  }
  if (!prompt.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const result = await searchCandidates(prompt, supabase, {
    practiceId: typeof body.practiceId === "string" && body.practiceId ? body.practiceId : undefined,
    mandateId,
    spec,
    embeddingText,
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

  return NextResponse.json({ matches, scanned: result.scanned, spec: result.spec, understood: result.understood, hidden: result.hidden, inPipelineSkipped: result.inPipelineSkipped, partial: result.partial, prompt });
}
