import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateAiPassportForCandidate } from "@/lib/ai-passport";

// Auto-generates AI summaries for candidates as they finish registering,
// so a recruiter never has to remember to click "Generate" -- this is the
// system-wide catch-all for every path that can produce a "registered"
// candidate: the public Apply form, candidate-portal profile edits, and
// quick_apply completions. Rather than wiring a bespoke trigger into each
// of those flows (including a cross-origin call from jobs-staffanchor for
// ones that happen there), this runs on a short interval and picks up
// anyone left without a summary -- simpler, self-healing, and needs no new
// auth plumbing between the two apps.
//
// Scheduled via vercel.json; Vercel automatically sends
// `Authorization: Bearer <CRON_SECRET>` on cron-triggered invocations when
// a CRON_SECRET env var is set on the project, which we check here.
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
    // Nothing to do without an AI key -- exit quietly rather than erroring
    // every 15 minutes in the cron log.
    return NextResponse.json({ ok: true, processed: 0, note: "GEMINI_API_KEY not configured" });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  // Candidates who have completed enough of the form to count as
  // registered (excludes bare quick_apply stubs and untouched leads) but
  // don't have a summary yet.
  const { data: pending, error } = await admin
    .from("candidates")
    .select("id, full_name")
    .not("status", "in", "(awaiting_input,lead)")
    .is("ai_summary", null)
    .order("created_at", { ascending: true })
    .limit(15); // bounded batch per run to keep this fast and cheap

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { candidate_id: string; ok: boolean; error?: string }[] = [];
  for (const candidate of pending ?? []) {
    const result = await generateAiPassportForCandidate(candidate.id, admin, {
      note: "auto_generated_on_registration",
    });
    results.push({
      candidate_id: candidate.id,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
    });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
