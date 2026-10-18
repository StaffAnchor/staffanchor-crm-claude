import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUB_GROUPS } from "@/lib/sub-group";

export const runtime = "nodejs";

// A recruiter sets a profile's group by hand (kept from then on), or hands it back to the automatic one.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { candidateId?: string; group?: string; subgroup?: string | null; reset?: boolean };
  if (!body.candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });

  if (body.reset) {
    const { error } = await supabase.from("candidates").update({ profile_group_locked: false, sub_group_locked: false }).eq("id", body.candidateId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: rpcErr } = await supabase.rpc("classify_candidate", { p_id: body.candidateId });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const group = body.group;
  if (!group || !["b2b_sales", "b2c_sales", "non_sales"].includes(group)) return NextResponse.json({ error: "Pick B2B, B2C or Non-Sales." }, { status: 400 });
  let sub: string | null = null;
  if (body.subgroup) {
    if (!SUB_GROUPS[group].includes(body.subgroup)) return NextResponse.json({ error: "Unknown sub-group." }, { status: 400 });
    sub = body.subgroup;
  }
  const { error } = await supabase
    .from("candidates")
    .update({
      profile_group: group,
      profile_subgroup: sub,
      sub_group: sub,
      sub_group_locked: true,
      profile_group_locked: true,
      profile_group_source: "manual",
      profile_group_confidence: "high",
      profile_group_reason: `Set by ${profile.full_name ?? "a recruiter"}`,
      profile_group_also: null,
      profile_group_needs_review: false,
      profile_group_updated_at: new Date().toISOString(),
    })
    .eq("id", body.candidateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
