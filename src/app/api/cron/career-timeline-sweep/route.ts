import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateCareerTimelineForCandidate } from "@/lib/generate-career-timeline-from-resume";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Self-healing catch-all for Career Timeline resume extraction -- mirrors
// api/cron/auto-summarize's philosophy exactly: rather than wiring a
// bespoke trigger into every place a resume can be uploaded (CRM create
// candidate, CRM edit profile, the public Apply form, Quick Apply,
// candidate-portal profile edits, vendor submissions), this runs on a
// short interval and picks up anyone whose resume_text doesn't match the
// hash it last generated a timeline from -- including a resume replaced
// long after the candidate was created, which a one-time upload trigger
// would miss entirely.
//
// Bug fix (Sep 2026): the original query only ever selected candidates
// with resume_text already populated -- so anyone who only had a
// resume_file_url (never had text extracted) was invisible to this sweep
// forever, no matter how many runs passed. That was the majority of the
// database: the entire historical Zoho bulk-import batch plus a steady
// trickle of new bulk-upload/quick-apply/self-registration candidates,
// ~580 candidates stuck on "Generate" in the Candidates table with no
// path to auto-resolve. generateCareerTimelineForCandidate already knows
// how to pull text from resume_file_url when resume_text is empty (see
// that file) -- this sweep just never gave it the chance. Now selects on
// stability_score being null (with either resume source available) as
// the primary signal, in addition to the original hash-diff check for
// candidates who already have a score but got a new/updated resume.
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

  const crypto = await import("crypto");

  // Batch A: never scored yet, on either resume source (resume_text
  // already extracted, or only a resume_file_url so far -- generate*
  // pulls text from the file itself when needed). This is the backlog
  // fix: previously nobody in this batch was reachable by the sweep at
  // all unless resume_text happened to already be populated.
  const { data: unscored, error: unscoredError } = await admin
    .from("candidates")
    .select("id")
    .is("stability_score", null)
    .or("resume_text.not.is.null,resume_file_url.not.is.null")
    .order("created_at", { ascending: false })
    .limit(20);

  if (unscoredError) {
    return NextResponse.json({ error: unscoredError.message }, { status: 500 });
  }

  // Batch B: already scored once, but resume_text has since changed (new
  // upload, edited profile) -- the original hash-diff check, unchanged.
  const { data: alreadyScored, error: scoredError } = await admin
    .from("candidates")
    .select("id, resume_text, career_timeline_resume_source_hash")
    .not("stability_score", "is", null)
    .not("resume_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (scoredError) {
    return NextResponse.json({ error: scoredError.message }, { status: 500 });
  }

  const staleHash = (alreadyScored ?? [])
    .filter((c) => {
      if (!c.resume_text) return false;
      const hash = crypto.createHash("md5").update(c.resume_text as string).digest("hex");
      return hash !== c.career_timeline_resume_source_hash;
    })
    .slice(0, 10);

  // Bounded per run, same reasoning as the AI-summary sweep: fast and
  // cheap per run, self-healing over many runs rather than one giant pass.
  const pending = [...(unscored ?? []), ...staleHash];

  const results: { candidate_id: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
  for (const candidate of pending) {
    const result = await generateCareerTimelineForCandidate(candidate.id, admin);
    results.push({
      candidate_id: candidate.id,
      ok: result.ok,
      skipped: result.ok ? result.skipped : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export const GET = withHeartbeat("career-timeline-sweep", 4320, handler);
