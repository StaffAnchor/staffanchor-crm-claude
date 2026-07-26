import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReplyDraft } from "@/lib/generate-reply-draft";

// Drafts a WhatsApp reply from a candidate's recent conversation history, for
// the recruiter to review/edit before sending -- see whatsapp-panel.tsx on
// the candidate detail page. Read-only: doesn't send or log anything, just
// returns a suggestion.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { candidateId } = await req.json();
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", candidateId)
    .single();
  if (candidateError || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, body_preview, created_at")
    .eq("candidate_id", candidateId)
    .not("body_preview", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = (messages ?? [])
    .filter((m) => m.body_preview)
    .reverse()
    .map((m) => ({ direction: m.direction as "inbound" | "outbound", body: m.body_preview as string, at: m.created_at }));

  // Most recently linked open mandate, purely for conversational context
  // (role/client) -- best-effort, not required for a draft to work.
  const { data: link } = await supabase
    .from("candidate_mandate_links")
    .select("mandates(role_title, client_name)")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mandate = link?.mandates as unknown as { role_title: string; client_name: string } | null;

  const result = await generateReplyDraft({
    candidate_name: candidate.full_name,
    role_title: mandate?.role_title ?? null,
    client_name: mandate?.client_name ?? null,
    history,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ draft: result.draft });
}
