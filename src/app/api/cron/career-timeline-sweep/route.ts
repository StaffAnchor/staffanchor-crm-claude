import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateCareerTimelineForCandidate } from "@/lib/generate-career-timeline-from-resume";

// Self-healing catch-all for Career Timeline resume extraction -- mirrors
// api/cron/auto-summarize's philosophy exactly: rather than wiring a
// bespoke trigger into every place a resume can be uploaded (CRM create
// candidate, CRM edit profile, the public Apply form, Quick Apply,
// candidate-portal profile edits, vendor submissions), this runs on a
// short interval and picks up anyone whose resume_text doesn't match the
// hash it last generated a timeline from -- including a resume replaced
// long after the candidate was created, which a one-time upload trigger
// would miss entirely.
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

  // Anyone with resume text on file whose last-generated hash is stale or
  // missing. Bounded batch, same reasoning as the AI-summary sweep: fast
  // and cheap per run, self-healing over a few runs rather than one giant
  // backfill pass.
  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, resume_text, career_timeline_resume_source_hash")
    .not("resume_text", "is", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const crypto = await import("crypto");
  const pending = (candidates ?? [])
    .filter((c) => {
      if (!c.resume_text) return false;
      const hash = crypto.createHash("md5").update(c.resume_text as string).digest("hex");
      return hash !== c.career_timeline_resume_source_hash;
    })
    .slice(0, 15); // bounded per run, same as auto-summarize

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
