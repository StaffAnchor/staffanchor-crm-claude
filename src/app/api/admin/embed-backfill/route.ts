import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedPendingCandidates } from "@/lib/embeddings";

// Admin-triggerable twin of the daily /api/cron/embed-candidates sweep --
// lets an admin run the embedding backfill on demand from Reports instead
// of waiting for the next scheduled run, and returns real failure reasons
// (not just a processed count) so a bad API key, wrong model name, or
// exhausted quota is visible immediately in the UI.
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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, processed: 0, note: "GEMINI_API_KEY not configured on this deployment" });
  }

  try {
    const result = await embedPendingCandidates(supabase, 50);
    return NextResponse.json({
      ok: true,
      processed: result.processed,
      candidatesConsidered: result.candidatesConsidered,
      errorSamples: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Lightweight coverage stats for the Reports "AI System Health" card --
// separate from the POST above so the card can show current numbers
// without triggering a run every time the page loads.
export async function GET() {
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

  const { count: total } = await supabase.from("candidates").select("id", { count: "exact", head: true });
  const { count: missingEmbedding } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .is("profile_embedding", null);
  const { count: missingSummary } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .is("ai_summary", null);

  return NextResponse.json({
    total: total ?? 0,
    missingEmbedding: missingEmbedding ?? 0,
    missingSummary: missingSummary ?? 0,
  });
}
