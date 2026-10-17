import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LEVEL_VALUES } from "@/lib/role-type";

export const runtime = "nodejs";

// Set the role type and level a mandate is for. Matching reads these; nothing guesses them.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { role_cluster?: unknown; seniority_band?: unknown; also_clusters?: unknown };
  const patch: Record<string, string | string[]> = {};
  let alsoOnly = false;
  if (typeof body.role_cluster === "string" && body.role_cluster) {
    const { data: ok } = await supabase.from("role_clusters").select("slug").eq("slug", body.role_cluster).maybeSingle();
    if (!ok) return NextResponse.json({ error: "Unknown role type." }, { status: 400 });
    patch.role_cluster = body.role_cluster;
  }
  if (typeof body.seniority_band === "string" && body.seniority_band) {
    if (!LEVEL_VALUES.includes(body.seniority_band)) return NextResponse.json({ error: "Unknown level." }, { status: 400 });
    patch.seniority_band = body.seniority_band;
  }
  if (Array.isArray(body.also_clusters)) {
    const list = Array.from(new Set(body.also_clusters.filter((x): x is string => typeof x === "string"))).slice(0, 4);
    const { data: known } = await supabase.from("role_clusters").select("slug").in("slug", list.length ? list : ["-"]);
    if ((known ?? []).length !== list.length) return NextResponse.json({ error: "Unknown role type." }, { status: 400 });
    patch.also_clusters = list;
    alsoOnly = Object.keys(patch).length === 1;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const { error } = await supabase.from("mandates").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  // The old card was written without this answer; it is rewritten from the mandate the next time it is opened.
  // Everyone already on the pipeline is scored again against the new set of accepted types the next time Best matches opens.
  if (patch.also_clusters) await supabase.from("candidate_mandate_links").update({ match_source: null }).eq("mandate_id", id).eq("match_source", "role_card");
  if (!alsoOnly) await supabase.from("mandate_role_cards").delete().eq("mandate_id", id);
  return NextResponse.json({ ok: true });
}
