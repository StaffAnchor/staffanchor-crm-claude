import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { matchCandidatesForMandate } from "@/lib/candidate-match";

// Daily sweep: re-runs the AI candidate matcher for every open mandate so
// the "Top match" badge on the Mandates list (and the ranked shortlist on
// each mandate's own page) stays fresh without a recruiter needing to
// remember to click "Find matching candidates" -- especially useful for
// older mandates that predate this feature, or ones nobody has re-run
// since new candidates were added to the database. Reuses the exact same
// matchCandidatesForMandate() lib call and auto_match_results/
// auto_match_computed_at write-back that the manual button and the
// on-creation auto-run already use, just looped over every open mandate
// and driven by the service-role client instead of a signed-in session.
export const maxDuration = 60;

// Bounded per run -- this calls Gemini once per mandate processed, and the
// free-tier key only has ~20 generateContent requests/day for the whole
// project (shared with auto-summarize and career-timeline-sweep, which now
// run on different days of the week -- see vercel.json). Oldest-computed
// first so every open mandate eventually gets refreshed across successive
// runs instead of the same handful winning every time.
const BATCH_SIZE = 8;

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
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  const { data: allOpenMandates, error } = await admin
    .from("mandates")
    .select("id, role_title, client_name")
    .eq("status", "open")
    .order("auto_match_computed_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const openMandates = allOpenMandates;

  if (!openMandates || openMandates.length === 0) {
    return NextResponse.json({ ok: true, mandatesProcessed: 0 });
  }

  const results: { mandate_id: string; ok: boolean; matches?: number; error?: string }[] = [];

  // Sequential, not parallel -- this calls out to the Gemini API once per
  // mandate, and running them all at once would be a good way to blow
  // through the free-tier rate limit in one shot (same reasoning as the
  // other AI-backed cron sweeps in this app).
  for (const mandate of openMandates) {
    try {
      const result = await matchCandidatesForMandate(mandate.id, admin);
      if (!result.ok) {
        results.push({ mandate_id: mandate.id, ok: false, error: result.error });
        continue;
      }
      await admin
        .from("mandates")
        .update({ auto_match_results: result.matches, auto_match_computed_at: new Date().toISOString() })
        .eq("id", mandate.id);
      results.push({ mandate_id: mandate.id, ok: true, matches: result.matches.length });
    } catch (err) {
      results.push({
        mandate_id: mandate.id,
        ok: false,
        error: err instanceof Error ? err.message : "match failed",
      });
    }
  }

  return NextResponse.json({ ok: true, mandatesProcessed: openMandates.length, results });
}
