import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { classifyCandidatePractices, classifyMandatePractice } from "@/lib/practice-classifier";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Self-healing daily sweep for AI practice tagging -- same philosophy as
// career-timeline-sweep: rather than wiring a bespoke trigger into every
// place a candidate or mandate can be created (CRM create forms, bulk
// upload, Quick Apply, self-registration, LinkedIn extension, vendor
// submissions), this runs on a schedule and picks up anyone with zero
// practice tags at all. Bounded per run (fast, cheap, self-healing over
// many runs) rather than one giant pass that could blow past the
// function's time limit or a provider's free-tier daily quota in one go.
export const maxDuration = 60;

const CANDIDATE_BATCH = 20;
const MANDATE_BATCH = 10;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ ok: true, processed: 0, note: "No AI provider configured" });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  const { data: taggedIdsRows } = await admin.from("candidate_practices").select("candidate_id");
  const taggedIds = new Set((taggedIdsRows ?? []).map((r) => r.candidate_id));

  const { data: candidatesPage, error: candidatesError } = await admin
    .from("candidates")
    .select("id")
    .or("resume_text.not.is.null,resume_file_url.not.is.null")
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_BATCH * 3);
  if (candidatesError) return NextResponse.json({ error: candidatesError.message }, { status: 500 });

  const untaggedCandidates = (candidatesPage ?? []).filter((c) => !taggedIds.has(c.id)).slice(0, CANDIDATE_BATCH);

  const { data: untaggedMandates, error: mandatesError } = await admin
    .from("mandates")
    .select("id")
    .is("practice_id", null)
    .eq("status", "open")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(MANDATE_BATCH);
  if (mandatesError) return NextResponse.json({ error: mandatesError.message }, { status: 500 });

  const candidateResults: { id: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
  for (const c of untaggedCandidates) {
    const result = await classifyCandidatePractices(c.id, admin);
    candidateResults.push({
      id: c.id,
      ok: result.ok,
      skipped: result.ok ? result.skipped : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  const mandateResults: { id: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
  for (const m of untaggedMandates ?? []) {
    const result = await classifyMandatePractice(m.id, admin);
    mandateResults.push({
      id: m.id,
      ok: result.ok,
      skipped: result.ok ? result.skipped : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    processed: candidateResults.length + mandateResults.length,
    candidateResults,
    mandateResults,
  });
}

export const GET = withHeartbeat("practice-tag-sweep", 1440, handler);
