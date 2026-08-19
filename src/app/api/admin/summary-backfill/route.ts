import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAiPassportForCandidate } from "@/lib/ai-passport";

// Admin-triggerable, on-demand twin of the auto-summarize cron's backlog
// pass -- lets an admin run a batch right now instead of waiting for the
// next scheduled sweep. Each candidate here gets the full treatment in one
// call: career-timeline extraction (-> stability_score), the AI
// summary/passport/skill-inventory, and a refreshed embedding
// (generateAiPassportForCandidate does all three in sequence). Newest
// candidates first, same reasoning as the cron.
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ ok: false, processed: 0, note: "No AI provider API key configured on this deployment" });
  }

  const { data: pending, error } = await supabase
    .from("candidates")
    .select("id, full_name")
    .is("ai_summary", null)
    .order("created_at", { ascending: false }) // newest first
    .limit(15); // bounded -- each candidate is 2-3 AI calls (career-timeline + summary + embedding)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { candidate_id: string; ok: boolean; error?: string }[] = [];
  for (const candidate of pending ?? []) {
    const result = await generateAiPassportForCandidate(candidate.id, supabase, {
      note: "admin_triggered_backfill",
    });
    results.push({
      candidate_id: candidate.id,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    errorSamples: results.filter((r) => !r.ok).map((r) => r.error!).slice(0, 5),
  });
}
