import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/cv-facts";

// Records what a recruiter did with an AI suggestion: add the candidate to
// this role's pipeline, or dismiss them with a reason (so they are not
// suggested for this role again, while staying in the bank for other roles).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ error: "Server isn't configured (missing service key)." }, { status: 503 });

  const { candidateId, action, reason } = await req.json();
  if (typeof candidateId !== "string" || (action !== "add" && action !== "dismiss")) {
    return NextResponse.json({ error: "candidateId and action (add or dismiss) are required" }, { status: 400 });
  }
  const { data: match } = await admin.from("mandate_ai_matches").select("score, summary, checks").eq("mandate_id", id).eq("candidate_id", candidateId).maybeSingle();
  if (!match) return NextResponse.json({ error: "That suggestion no longer exists. Refresh the page." }, { status: 404 });

  if (action === "add") {
    // Insert as the signed-in recruiter (same permissions as adding by hand).
    const { error } = await supabase.from("candidate_mandate_links").insert({
      candidate_id: candidateId,
      mandate_id: id,
      added_by: user.id,
      match_score: match.score,
      match_score_breakdown: { notes: match.summary ?? "Suggested by AI from the candidate bank", source: "ai_evidence" },
      match_source: "ai_evidence",
      matched_at: new Date().toISOString(),
    });
    if (error && !/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("mandate_ai_matches").update({ status: "added", decided_by: user.id, decided_at: new Date().toISOString() }).eq("mandate_id", id).eq("candidate_id", candidateId);
    return NextResponse.json({ ok: true });
  }

  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : "Not a fit";
  await admin.from("mandate_ai_matches").update({ status: "dismissed", dismissed_reason: cleanReason, decided_by: user.id, decided_at: new Date().toISOString() }).eq("mandate_id", id).eq("candidate_id", candidateId);
  return NextResponse.json({ ok: true });
}
