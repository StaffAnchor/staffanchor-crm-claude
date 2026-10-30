import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

import { NOT_A_FIT_CODES, PERSON_FLAGS } from "@/lib/not-a-fit-reasons";

const REASONS = NOT_A_FIT_CODES;

// "Not a fit for this mandate", with a reason. The person stops appearing in this mandate's matches, and the reasons are
// counted on the Scorecard so the ranking can be corrected where it is wrong.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { candidate_id?: unknown; reason?: unknown };
  if (typeof body.candidate_id !== "string" || typeof body.reason !== "string" || !REASONS.includes(body.reason)) {
    return NextResponse.json({ error: "Pick a reason." }, { status: 400 });
  }
  const { error } = await supabase
    .from("match_dismissals")
    .upsert({ mandate_id: id, candidate_id: body.candidate_id, reason: body.reason, dismissed_by: user.id }, { onConflict: "mandate_id,candidate_id" });
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  // A reason about the person (no quota, lead generation only, not SaaS...) is remembered against them for other roles.
  if (PERSON_FLAGS.includes(body.reason)) {
    await supabase
      .from("candidate_sales_flags")
      .upsert({ candidate_id: body.candidate_id, flag: body.reason, mandate_id: id, set_by: user.id }, { onConflict: "candidate_id,flag" });
  }
  return NextResponse.json({ ok: true });
}
