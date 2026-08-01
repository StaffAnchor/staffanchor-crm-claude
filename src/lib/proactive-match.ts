import type { SupabaseClient } from "@supabase/supabase-js";

// Gated proactive matcher (build directive 3 of the V2 matching upgrade).
// The idea: the moment a candidate's profile embedding is fresh (new
// registration, edit, or manual regenerate), cheaply check it against every
// open mandate's embedding via pgvector cosine similarity -- a local DB
// query, <10ms, $0 API cost, no Gemini call at all. Only pairs crossing a
// high-confidence threshold get queued; the actual (expensive) Gemini
// evaluation happens later, batched, in api/cron/proactive-match-sweep, so
// this never turns "candidate registers" into "Gemini call fires," which
// would blow through the shared ~20/day free-tier quota almost immediately.
export const PROACTIVE_MATCH_SIMILARITY_THRESHOLD = 0.82;

/**
 * Checks one candidate's embedding against every open mandate's embedding
 * and queues any pair crossing the confidence threshold for later batched
 * Gemini evaluation. Safe to call repeatedly (e.g. every time a candidate's
 * profile is regenerated) -- already-queued pairs are left alone rather than
 * reset, via an upsert that ignores conflicts.
 */
export async function queueProactiveMatchesForCandidate(candidateId: string, supabase: SupabaseClient): Promise<void> {
  const { data: candidate } = await supabase
    .from("candidates")
    .select("profile_embedding")
    .eq("id", candidateId)
    .single();
  const embedding = candidate?.profile_embedding as number[] | null | undefined;
  if (!embedding || !Array.isArray(embedding)) return;

  const { data: mandates, error } = await supabase.rpc("match_mandates_for_candidate", {
    query_embedding: embedding,
    match_count: 20,
  });
  if (error || !mandates) return;

  const strong = (mandates as { id: string; similarity: number }[]).filter(
    (m) => m.similarity >= PROACTIVE_MATCH_SIMILARITY_THRESHOLD
  );
  if (strong.length === 0) return;

  const rows = strong.map((m) => ({
    candidate_id: candidateId,
    mandate_id: m.id,
    similarity: m.similarity,
  }));

  // ignoreDuplicates: a pair already queued (pending or already evaluated)
  // is left exactly as it was -- we don't want a candidate's routine profile
  // edit to reset an 'evaluated' row back to needing re-evaluation.
  await supabase
    .from("proactive_match_queue")
    .upsert(rows, { onConflict: "candidate_id,mandate_id", ignoreDuplicates: true });
}
