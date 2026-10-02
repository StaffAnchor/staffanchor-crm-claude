import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyStageChange, RECRUITER_REJECTION_REASONS, type Stage } from "@/lib/mandate-stage";

// One decision from the triage screen: shortlist, reject with a reason, set
// aside for later, or undo the last one. Uses the same stage-change path as
// the pipeline table, so audit trail, events and notifications behave the
// same whichever screen is used.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { linkId, action, reasonCode, previousStage } = await req.json();
  if (typeof linkId !== "string" || !["shortlist", "reject", "later", "undo"].includes(action)) {
    return NextResponse.json({ error: "linkId and a valid action are required" }, { status: 400 });
  }

  const { data: link } = await supabase
    .from("candidate_mandate_links")
    .select("id, candidate_id, mandate_id, stage, candidates(full_name), mandates(role_title, client_name)")
    .eq("id", linkId)
    .maybeSingle();
  if (!link || link.mandate_id !== id) return NextResponse.json({ error: "That candidate isn't in this role." }, { status: 404 });

  const cand = Array.isArray(link.candidates) ? link.candidates[0] : link.candidates;
  const mand = Array.isArray(link.mandates) ? link.mandates[0] : link.mandates;
  const base = {
    linkId,
    candidateId: link.candidate_id as string,
    mandateId: id,
    candidateName: (cand as { full_name?: string } | null)?.full_name ?? "Candidate",
    mandateLabel: `${(mand as { role_title?: string } | null)?.role_title ?? "Role"} — ${(mand as { client_name?: string } | null)?.client_name ?? ""}`,
    previousStage: link.stage as string,
    source: "recruiter" as const,
  };
  const seen = { viewed_at: new Date().toISOString(), viewed_by: user.id };

  try {
    if (action === "later") {
      await supabase.from("candidate_mandate_links").update(seen).eq("id", linkId);
      return NextResponse.json({ ok: true });
    }
    if (action === "shortlist") {
      await applyStageChange(supabase, { ...base, newStage: "shortlisted" });
      await supabase.from("candidate_mandate_links").update(seen).eq("id", linkId);
      return NextResponse.json({ ok: true });
    }
    if (action === "reject") {
      if (!RECRUITER_REJECTION_REASONS.some((r) => r.value === reasonCode)) return NextResponse.json({ error: "Pick a reason." }, { status: 400 });
      await applyStageChange(supabase, { ...base, newStage: "rejected", rejectionCategory: reasonCode });
      await supabase.from("candidate_mandate_links").update(seen).eq("id", linkId);
      return NextResponse.json({ ok: true });
    }
    // undo: put the person back where they were and clear any rejection.
    const back = (typeof previousStage === "string" ? previousStage : "sourced") as Stage;
    await applyStageChange(supabase, { ...base, newStage: back });
    await supabase.from("candidate_mandate_links").update({ rejected_from_stage: null, rejection_category: null, rejection_reason: null }).eq("id", linkId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "That didn't work. Try again." }, { status: 400 });
  }
}
