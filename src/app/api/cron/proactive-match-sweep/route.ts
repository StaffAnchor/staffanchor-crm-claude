import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ensureMandateEmbedding } from "@/lib/embeddings";
import { queueProactiveMatchesForCandidate } from "@/lib/proactive-match";
import { matchCandidatesForMandate } from "@/lib/candidate-match";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Gated proactive matcher, build directive 3 of the V2 matching upgrade.
// Two jobs, both bounded to protect the shared ~20/day Gemini generateContent
// quota (auto-summarize, career-timeline-sweep, and mandate-auto-rematch
// already share it -- see cron-sweeps.yml's day-of-week staggering):
//
//   1. RE-SCAN (cheap, zero Gemini calls): for every candidate whose
//      embedding changed recently, run the local pgvector similarity check
//      against open mandates and queue any high-confidence pair. This is
//      the same check ai-passport.ts already runs immediately after each
//      generation, but re-running it here on a schedule also catches
//      candidates registered via jobs-staffanchor (which has its own
//      ai-passport.ts copy without this hook) and anyone the immediate
//      check might have missed.
//   2. EVALUATE (expensive, one Gemini call per mandate group): pending
//      queue rows are grouped by mandate and evaluated with
//      matchCandidatesForMandate's candidateIdsOverride -- reusing the
//      exact same clause-level scoring logic as a manual "Find matches"
//      run, just scoped to this small pre-qualified set instead of the
//      full candidate pool. Strong hits are persisted to
//      mandate_proactive_matches for the matching workspace page to
//      surface as "new since you last looked".
//
// Deliberately scheduled just once a week (Sundays -- the one day none of
// the other three Gemini-backed crons run) rather than daily, and capped at
// a small number of Gemini calls per run, so this genuinely-nice-to-have
// feature never crowds out the summary generation and manual matching that
// already compete hard for the same daily quota.
export const maxDuration = 60;

const RESCAN_WINDOW_DAYS = 8; // covers the week since this cron's last run
const RESCAN_BATCH_SIZE = 200; // candidates checked per run (cheap, no Gemini)
const MANDATE_EMBED_BATCH_SIZE = 20; // open mandates topped up with an embedding per run (cheap)
const EVALUATE_MANDATE_GROUPS_PER_RUN = 3; // Gemini calls this run spends -- keep tiny

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
    return NextResponse.json({ ok: true, note: "GEMINI_API_KEY not configured" });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  // Step 0: top up embeddings for any open mandate that doesn't have one yet
  // -- without this, a newly-created mandate would never be a candidate for
  // the vector check below until someone happens to run a manual match on it.
  const { data: mandatesMissingEmbedding } = await admin
    .from("mandates")
    .select(
      "id, role_title, category, sub_domain, sub_domains, job_description, jd_overview, jd_responsibilities, jd_candidate_profile, must_haves, good_to_haves, embedding_source_hash"
    )
    .eq("status", "open")
    .is("embedding", null)
    .limit(MANDATE_EMBED_BATCH_SIZE);

  for (const mandate of mandatesMissingEmbedding ?? []) {
    try {
      await ensureMandateEmbedding(
        {
          id: mandate.id,
          role_title: mandate.role_title,
          category: mandate.category,
          sub_domain: mandate.sub_domain,
          sub_domains: mandate.sub_domains,
          job_description: mandate.job_description,
          jd_overview: mandate.jd_overview,
          jd_responsibilities: mandate.jd_responsibilities,
          jd_candidate_profile: mandate.jd_candidate_profile,
          must_haves: mandate.must_haves,
          good_to_haves: mandate.good_to_haves,
          embedding_source_hash: mandate.embedding_source_hash,
        },
        admin
      );
    } catch (err) {
      console.error("proactive-match-sweep: mandate embedding top-up failed", mandate.id, err);
    }
  }

  // Step 1: re-scan recently-updated candidates -- cheap, no Gemini calls.
  const recentCutoff = new Date(Date.now() - RESCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentCandidates } = await admin
    .from("candidates")
    .select("id")
    .not("profile_embedding", "is", null)
    .gte("profile_embedding_updated_at", recentCutoff)
    .order("profile_embedding_updated_at", { ascending: false })
    .limit(RESCAN_BATCH_SIZE);

  let rescanned = 0;
  for (const c of recentCandidates ?? []) {
    try {
      await queueProactiveMatchesForCandidate(c.id as string, admin);
      rescanned++;
    } catch (err) {
      console.error("proactive-match-sweep: queueing failed", c.id, err);
    }
  }

  // Step 2: evaluate a small number of pending queue groups with Gemini.
  const { data: pending } = await admin
    .from("proactive_match_queue")
    .select("id, candidate_id, mandate_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200); // pulled generously, but only EVALUATE_MANDATE_GROUPS_PER_RUN mandates' worth actually get a Gemini call below

  const byMandate = new Map<string, { queueIds: string[]; candidateIds: string[] }>();
  for (const row of pending ?? []) {
    const entry = byMandate.get(row.mandate_id as string) ?? { queueIds: [], candidateIds: [] };
    entry.queueIds.push(row.id as string);
    entry.candidateIds.push(row.candidate_id as string);
    byMandate.set(row.mandate_id as string, entry);
  }

  const mandateGroups = Array.from(byMandate.entries()).slice(0, EVALUATE_MANDATE_GROUPS_PER_RUN);
  const results: { mandate_id: string; ok: boolean; matched?: number; error?: string }[] = [];

  for (const [mandateId, group] of mandateGroups) {
    try {
      const result = await matchCandidatesForMandate(mandateId, admin, {
        candidateIdsOverride: group.candidateIds,
      });
      if (result.ok) {
        for (const match of result.matches) {
          await admin
            .from("mandate_proactive_matches")
            .upsert(
              { mandate_id: mandateId, candidate_id: match.candidate_id, match },
              { onConflict: "mandate_id,candidate_id" }
            );
        }
        results.push({ mandate_id: mandateId, ok: true, matched: result.matches.length });
      } else {
        results.push({ mandate_id: mandateId, ok: false, error: result.error });
      }
      // Mark this mandate group's queue rows evaluated regardless of outcome
      // -- a transient Gemini failure shouldn't leave rows pending forever;
      // the next re-scan pass will naturally re-queue anyone still relevant.
      await admin
        .from("proactive_match_queue")
        .update({ status: "evaluated", evaluated_at: new Date().toISOString() })
        .in("id", group.queueIds);
    } catch (err) {
      results.push({ mandate_id: mandateId, ok: false, error: err instanceof Error ? err.message : "evaluation failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    rescanned,
    pendingQueueDepth: (pending ?? []).length,
    mandateGroupsEvaluated: mandateGroups.length,
    results,
  });
}

export const GET = withHeartbeat("proactive-match-sweep", 10080, handler);
