import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractCvFactsForCandidate, getServiceClient, pickCandidatesForCvFacts } from "@/lib/cv-facts";

// Admin "Read recent CVs now": reads the CVs of the newest candidates that
// have not been read yet (or, with force and ids, re-reads specific ones).
// Small batches so one request stays inside the time limit; press again for
// more.
export const maxDuration = 300;
const DEFAULT_BATCH = 20;
const MAX_BATCH = 40;
const CONCURRENCY = 4;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { supabase };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ ok: false, error: "No AI provider key configured on this deployment" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(body.limit) || DEFAULT_BATCH));
  const force = body.force === true;
  const ids: string[] = Array.isArray(body.candidateIds) && body.candidateIds.length > 0 ? body.candidateIds.slice(0, MAX_BATCH) : await pickCandidatesForCvFacts(admin, limit);

  const results = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(chunk.map((id) => extractCvFactsForCandidate(id, admin, { force })))));
  }
  const ok = results.filter((r) => r.ok && !("skipped" in r && r.skipped)).length;
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: true,
    attempted: ids.length,
    read: ok,
    failed: failed.length,
    errors: failed.slice(0, 5).map((f) => ("error" in f ? f.error : "")),
  });
}

// Coverage: how many candidates with a CV have been read.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const [{ count: withCv }, { count: read }] = await Promise.all([
    supabase.from("candidates").select("id", { count: "exact", head: true }).or("resume_file_url.not.is.null,resume_text.not.is.null"),
    supabase.from("candidate_cv_facts").select("candidate_id", { count: "exact", head: true }),
  ]);
  return NextResponse.json({ withCv: withCv ?? 0, read: read ?? 0 });
}
