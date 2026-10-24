import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

// Put chosen people on the pipelines of the roles they were picked for on the hiring board, as the signed-in recruiter.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { pairs?: { candidateId?: unknown; mandateId?: unknown; score?: unknown }[] };
  const pairs = (Array.isArray(body.pairs) ? body.pairs : [])
    .filter((p) => typeof p.candidateId === "string" && UUID.test(p.candidateId) && typeof p.mandateId === "string" && UUID.test(p.mandateId))
    .slice(0, 300) as { candidateId: string; mandateId: string; score?: unknown }[];
  if (!pairs.length) return NextResponse.json({ error: "Nothing to add" }, { status: 400 });

  let added = 0;
  let already = 0;
  for (const p of pairs) {
    const { error } = await supabase.from("candidate_mandate_links").insert({
      candidate_id: p.candidateId,
      mandate_id: p.mandateId,
      added_by: user.id,
      match_score: typeof p.score === "number" ? Math.max(0, Math.min(100, Math.round(p.score))) : null,
      match_source: "hiring_board",
      matched_at: new Date().toISOString(),
    });
    if (!error) {
      added++;
      await supabase.from("mandate_ai_matches").update({ status: "added", decided_by: user.id, decided_at: new Date().toISOString() }).eq("mandate_id", p.mandateId).eq("candidate_id", p.candidateId);
    } else if (/duplicate|unique/i.test(error.message)) already++;
  }
  return NextResponse.json({ ok: true, added, already });
}
