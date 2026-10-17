import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LEVEL_VALUES } from "@/lib/role-type";

export const runtime = "nodejs";

// A person checks one tagged role: right, or wrong with the correct type and level. A correction is stored as a
// recruiter-set tag, which the automatic classifier never overwrites.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { candidate_id?: string; tagged_cluster?: string; tagged_level?: string; verdict?: string; correct_cluster?: string; correct_level?: string };
  if (!b.candidate_id || (b.verdict !== "right" && b.verdict !== "wrong")) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (b.verdict === "wrong") {
    if (!b.correct_cluster || !b.correct_level || !LEVEL_VALUES.includes(b.correct_level)) return NextResponse.json({ error: "Pick the right type and level." }, { status: 400 });
    const { data: ok } = await supabase.from("role_clusters").select("slug").eq("slug", b.correct_cluster).maybeSingle();
    if (!ok) return NextResponse.json({ error: "Unknown role type." }, { status: 400 });
  }
  const { error } = await supabase.from("tag_checks").insert({
    candidate_id: b.candidate_id,
    tagged_cluster: b.tagged_cluster ?? null,
    tagged_level: b.tagged_level ?? null,
    verdict: b.verdict,
    correct_cluster: b.verdict === "wrong" ? b.correct_cluster : null,
    correct_level: b.verdict === "wrong" ? b.correct_level : null,
    checked_by: user.id,
  });
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  if (b.verdict === "wrong") {
    const { data: old } = await supabase.from("candidate_role_tags").select("metro, region, track, domain").eq("candidate_id", b.candidate_id).eq("is_current", true).limit(1).maybeSingle();
    // Replace the automatic tags with the corrected one; the nightly rules and AI never overwrite a recruiter tag.
    await supabase.from("candidate_role_tags").delete().eq("candidate_id", b.candidate_id).neq("source", "recruiter");
    await supabase.from("candidate_role_tags").upsert(
      { candidate_id: b.candidate_id, cluster_slug: b.correct_cluster, is_current: true, seniority: b.correct_level, level_source: "recruiter", source: "recruiter", confidence: 1, metro: old?.metro ?? null, region: old?.region ?? null, track: old?.track ?? null, domain: old?.domain ?? null, updated_at: new Date().toISOString() },
      { onConflict: "candidate_id,cluster_slug,is_current" }
    );
  }
  return NextResponse.json({ ok: true });
}
