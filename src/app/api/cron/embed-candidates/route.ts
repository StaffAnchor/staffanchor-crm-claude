import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { embedCandidate } from "@/lib/embeddings";

// Backfill sweep for the Semantic Search Copilot (Phase 2, Task 3): embeds
// any candidate missing a profile_embedding (new registrations, recruiter
// edits, resume updates) so the Cmd+K copilot search can find them.
// Mirrors the existing auto-summarize cron's shape exactly -- same
// CRON_SECRET check, same service-role client, same bounded-batch pattern
// -- so it slots in without touching anything else.
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
  // -- covers both brand-new candidates and edited ones. Bounded batch keeps
  // each run fast/cheap regardless of pipeline size.
  const { data: pending, error } = await admin
    .from("candidates")
    .select(
      "id, full_name, category, sub_domain, secondary_sub_domains, current_job_title, current_employer, current_industry, industries, total_experience_years, current_location, skills, segment_data, ai_summary, resume_text, updated_at, profile_embedding_updated_at"
    )
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const toEmbed = (pending ?? []).filter((c) => {
    if (!c.profile_embedding_updated_at) return true;
    if (!c.updated_at) return false;
    return new Date(c.updated_at).getTime() > new Date(c.profile_embedding_updated_at).getTime();
  });

  let processed = 0;
  for (const candidate of toEmbed.slice(0, 25)) {
    const ok = await embedCandidate(candidate, admin);
    if (ok) processed++;
  }

  return NextResponse.json({ ok: true, processed, candidatesConsidered: toEmbed.length });
}
