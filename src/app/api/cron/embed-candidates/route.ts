import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedPendingCandidates } from "@/lib/embeddings";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Backfill sweep: embeds any candidate missing a profile_embedding (new
// registrations, recruiter edits, resume updates) so both the Cmd+K
// Semantic Search Copilot AND matchCandidatesForMandate's semantic recall
// path (src/lib/candidate-match.ts) can find them. New profiles are now
// also embedded immediately at generation time (see ai-passport.ts's
// embedCandidate call), so this sweep's real job is clearing the
// historical backlog of older candidates who never got embedded, plus
// picking up anyone whose profile changed since their last embedding.
//
// The actual batch/pending logic now lives in embedPendingCandidates()
// (src/lib/embeddings.ts), shared with the admin-triggered
// /api/admin/embed-backfill route -- previously this route silently
// swallowed every failure, which is how the whole candidate table went
// unembedded for weeks with zero trace of why. Both routes now return real
// error samples instead of just a processed count.
export const maxDuration = 60;

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
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: true, processed: 0, note: "GEMINI_API_KEY not configured" });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  try {
    // Bumped from 25 -> 50 per run, run every 3 hours (vercel.json) instead
    // of once daily -- see prior header comment for rationale. Kept well
    // under maxDuration=60s (50 * ~0.3-0.6s each is comfortably inside the
    // budget).
    const result = await embedPendingCandidates(admin, 50);
    return NextResponse.json({
      ok: true,
      processed: result.processed,
      candidatesConsidered: result.candidatesConsidered,
      errorSamples: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/embed-candidates] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withHeartbeat("embed-candidates", 1440, handler);
