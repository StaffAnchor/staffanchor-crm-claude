import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gapLabels, type PassportRow } from "@/lib/saas-passport";

export const runtime = "nodejs";

const STAFF = ["admin", "recruiter", "partner"];
const MAX_PER_CALL = 100;

// Asks one recruiter to collect the missing details for a set of candidates.
// Each candidate becomes one open task in that recruiter's list; a candidate
// that already has an open "collect details" task for the same person is
// skipped, so pressing twice never doubles the work.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!me || !STAFF.includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const recruiterId = typeof body.recruiterId === "string" ? body.recruiterId : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const ids: string[] = Array.isArray(body.candidateIds) ? body.candidateIds.filter((x: unknown): x is string => typeof x === "string").slice(0, MAX_PER_CALL) : [];
  if (!recruiterId || ids.length === 0) return NextResponse.json({ error: "Choose a recruiter and at least one candidate." }, { status: 400 });

  const { data: assignee } = await supabase.from("profiles").select("id, full_name, role").eq("id", recruiterId).maybeSingle();
  if (!assignee || !STAFF.includes(assignee.role)) return NextResponse.json({ error: "That person can't be given tasks." }, { status: 400 });

  const { data: rows } = await supabase
    .from("saas_passport")
    .select("candidate_id, full_name, passport_missing, readiness_missing")
    .in("candidate_id", ids);
  const people = (rows ?? []) as Pick<PassportRow, "candidate_id" | "full_name" | "passport_missing" | "readiness_missing">[];
  if (people.length === 0) return NextResponse.json({ error: "Those candidates could not be found." }, { status: 404 });

  const { data: open } = await supabase
    .from("recruiter_inbox")
    .select("candidate_id")
    .eq("task_type", "COLLECT_DETAILS")
    .eq("recruiter_id", recruiterId)
    .in("status", ["open", "snoozed"])
    .in("candidate_id", ids);
  const already = new Set(((open ?? []) as { candidate_id: string }[]).map((r) => r.candidate_id));

  const toCreate = people
    .filter((p) => !already.has(p.candidate_id))
    .map((p) => {
      const gaps = gapLabels(p);
      return {
        recruiter_id: recruiterId,
        candidate_id: p.candidate_id,
        task_type: "COLLECT_DETAILS",
        title: `Collect details: ${p.full_name ?? "candidate"}`,
        detail: `${gaps.length ? `Missing: ${gaps.join(", ")}. ` : ""}Ask on a call or WhatsApp and update the profile.${note ? ` Note: ${note}` : ""} Asked by ${me.full_name ?? "admin"}.`,
        priority: "normal",
      };
    });

  if (toCreate.length > 0) {
    const { error } = await supabase.from("recruiter_inbox").insert(toCreate);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "collect_details_assigned",
      entity: "saas_practice",
      entity_id: recruiterId,
      detail: { count: toCreate.length, skipped: people.length - toCreate.length },
    });
  }
  return NextResponse.json({ ok: true, created: toCreate.length, skipped: people.length - toCreate.length, assignee: assignee.full_name });
}
