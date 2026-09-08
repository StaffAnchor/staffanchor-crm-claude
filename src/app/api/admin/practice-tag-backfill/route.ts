import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyCandidatePractices, classifyMandatePractice } from "@/lib/practice-classifier";

// Admin-triggerable twin of the daily /api/cron/practice-tag-sweep -- lets
// an admin run the AI practice-classification backfill on demand instead
// of waiting for the next scheduled run, same pattern as embed-backfill.
const CANDIDATE_BATCH = 40;
const MANDATE_BATCH = 10;

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

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ ok: false, processed: 0, note: "No AI provider API key configured on this deployment" });
  }

  // Candidates with zero practice rows at all -- newest first, same
  // "whoever just applied is who a recruiter is looking at" ordering as
  // the other AI backfills.
  const { data: taggedIdsRows } = await supabase.from("candidate_practices").select("candidate_id");
  const taggedIds = new Set((taggedIdsRows ?? []).map((r) => r.candidate_id));

  const { data: candidatesPage } = await supabase
    .from("candidates")
    .select("id")
    .or("resume_text.not.is.null,resume_file_url.not.is.null")
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_BATCH * 3); // over-fetch since some will already be tagged; filtered client-side below

  const untaggedCandidates = (candidatesPage ?? []).filter((c) => !taggedIds.has(c.id)).slice(0, CANDIDATE_BATCH);

  const { data: untaggedMandates } = await supabase
    .from("mandates")
    .select("id")
    .is("practice_id", null)
    .eq("status", "open")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(MANDATE_BATCH);

  const candidateResults: { id: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
  for (const c of untaggedCandidates) {
    const result = await classifyCandidatePractices(c.id, supabase);
    candidateResults.push({
      id: c.id,
      ok: result.ok,
      skipped: result.ok ? result.skipped : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  const mandateResults: { id: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
  for (const m of untaggedMandates ?? []) {
    const result = await classifyMandatePractice(m.id, supabase);
    mandateResults.push({
      id: m.id,
      ok: result.ok,
      skipped: result.ok ? result.skipped : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    candidatesProcessed: candidateResults.length,
    candidatesTagged: candidateResults.filter((r) => r.ok && !r.skipped).length,
    mandatesProcessed: mandateResults.length,
    mandatesTagged: mandateResults.filter((r) => r.ok && !r.skipped).length,
    errorSamples: [...candidateResults, ...mandateResults]
      .filter((r) => !r.ok)
      .slice(0, 5)
      .map((r) => r.error ?? "unknown error"),
  });
}

// Coverage stats for the AI System Health card.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { count: totalCandidates } = await supabase.from("candidates").select("id", { count: "exact", head: true });
  const { data: taggedIdsRows } = await supabase.from("candidate_practices").select("candidate_id");
  const taggedCandidateCount = new Set((taggedIdsRows ?? []).map((r) => r.candidate_id)).size;

  const { count: openMandates } = await supabase
    .from("mandates")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("is_archived", false);
  const { count: taggedOpenMandates } = await supabase
    .from("mandates")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("is_archived", false)
    .not("practice_id", "is", null);

  return NextResponse.json({
    totalCandidates: totalCandidates ?? 0,
    taggedCandidates: taggedCandidateCount,
    untaggedCandidates: (totalCandidates ?? 0) - taggedCandidateCount,
    totalOpenMandates: openMandates ?? 0,
    taggedOpenMandates: taggedOpenMandates ?? 0,
    untaggedOpenMandates: (openMandates ?? 0) - (taggedOpenMandates ?? 0),
  });
}
