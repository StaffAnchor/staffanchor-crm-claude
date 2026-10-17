import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Add people chosen from the ranked matches to this role's pipeline, as the signed-in recruiter.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { candidates?: { id?: unknown; score?: unknown; note?: unknown }[] };
  const list = (Array.isArray(body.candidates) ? body.candidates : []).filter((c) => typeof c.id === "string" && /^[0-9a-f-]{36}$/i.test(c.id as string)).slice(0, 50);
  let added = 0;
  for (const c of list) {
    const { error } = await supabase.from("candidate_mandate_links").insert({
      candidate_id: c.id,
      mandate_id: id,
      added_by: user.id,
      match_score: typeof c.score === "number" ? Math.max(0, Math.min(100, Math.round(c.score))) : null,
      match_score_breakdown: { notes: typeof c.note === "string" ? c.note.slice(0, 300) : "Chosen from the best matches for this role", source: "role_card" },
      match_source: "role_card",
      matched_at: new Date().toISOString(),
    });
    if (!error || /duplicate|unique/i.test(error.message)) added++;
  }
  return NextResponse.json({ ok: true, added });
}
