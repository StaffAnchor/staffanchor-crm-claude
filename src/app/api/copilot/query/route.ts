import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embeddings";

export type CopilotResult = {
  id: string;
  full_name: string;
  category: string | null;
  sub_domain: string | null;
  current_job_title: string | null;
  current_employer: string | null;
  total_experience_years: number | null;
  current_location: string | null;
  status: string;
  ai_summary: string | null;
  similarity: number;
};

// Semantic Search Copilot (Phase 2, Task 3): embeds the recruiter's free-text
// query with the same cheap Gemini model used for candidate embeddings, then
// ranks candidates by cosine similarity via match_candidates(). Runs against
// the caller's own session (not a service-role client) so existing RLS
// (staff full access / freelancer scoped to assigned-mandate candidates)
// governs results with zero new authorization logic.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { query } = await req.json();
  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const embedding = await generateEmbedding(query);
  if (!embedding) {
    return NextResponse.json(
      { error: "Search isn't available right now (embedding generation failed)." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.rpc("match_candidates", {
    query_embedding: embedding,
    match_count: 10,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: (data ?? []) as CopilotResult[] });
}
