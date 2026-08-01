import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedCandidate } from "@/lib/embeddings";

// Backfill sweep: embeds any candidate missing a profile_embedding (new
// registrations, recruiter edits, resume updates) so both the Cmd+K
// Semantic Search Copilot AND matchCandidatesForMandate's semantic recall
// path (src/lib/candidate-match.ts) can find them. New profiles are now
// also embedded immediately at generation time (see ai-passport.ts's
// embedCandidate call), so this sweep's real job is clearing the
// historical backlog of older candidates who never got embedded, plus
// picking up anyone whose profile changed since their last embedding.
//
// Deliberately run aggressively (larger per-run batch, every 3 hours via
// .github/workflows/embed-candidates-frequent.yml -- Vercel's Hobby plan
// caps its own native cron at once/day, so the higher frequency lives in
// GitHub Actions instead) rather than the old once-daily/25-per-run pace:
// Gemini's
// text-embedding-004 sits in a SEPARATE free-tier quota bucket from the
// generateContent models (gemini-2.5-flash-lite/flash/2.0-flash) used for
// summaries/matching, so embedding the entire backlog at max safe capacity
// every day does not compete with or put summary-generation quota at risk.
// The whole point is for the system to "know" its full candidate pool at
// all times, so mandate matching's semantic recall is never working off a
// stale or incomplete memory of who's actually in the database.
export const maxDuration = 60;

// Small pacing delay between embedContent calls within a run, purely to
// avoid bursting a per-minute rate limit on this model -- embeddings are
// cheap/fast, so this barely affects how many clear per run.
const INTER_CALL_DELAY_MS = 150;
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
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

  // Anyone missing an embedding, or whose profile changed since their last
  // embedding was generated (updated_at newer than profile_embedding_updated_at)
  // -- covers both the historical backlog and edited candidates. Large pool
  // pulled per run (backlog-clearing is the point), oldest-first so the
  // longest-neglected profiles get memorized first.
  const { data: pending, error } = await admin
    .from("candidates")
    .select(
      "id, full_name, category, sub_domain, secondary_sub_domains, current_job_title, current_employer, current_industry, industries, total_experience_years, current_location, skills, segment_data, ai_summary, resume_text, updated_at, profile_embedding_updated_at"
    )
    .order("created_at", { ascending: true })
    .limit(600);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const toEmbed = (pending ?? []).filter((c) => {
    if (!c.profile_embedding_updated_at) return true;
    if (!c.updated_at) return false;
    return new Date(c.updated_at).getTime() > new Date(c.profile_embedding_updated_at).getTime();
  });

  // Bumped from 25 -> 50 per run, run every 3 hours (vercel.json) instead
  // of once daily -- see file header on why this is safe to run hard.
  // Kept well under maxDuration=60s even accounting for embed latency +
  // the pacing delay (50 * ~0.3-0.6s each is comfortably inside the
  // budget); a bigger per-run batch risks Vercel killing the function
  // mid-batch before it finishes, which the frequent schedule makes
  // unnecessary anyway -- 50/run * 8 runs/day = 400/day.
  const BATCH_SIZE = 50;
  let processed = 0;
  for (const candidate of toEmbed.slice(0, BATCH_SIZE)) {
    const ok = await embedCandidate(candidate, admin);
    if (ok) processed++;
    await sleep(INTER_CALL_DELAY_MS);
  }

  return NextResponse.json({ ok: true, processed, candidatesConsidered: toEmbed.length });
}
