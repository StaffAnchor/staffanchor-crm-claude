import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const OUTCOMES = ["spoke", "no_answer", "busy", "wrong_number"];
const INTERESTS = ["yes", "maybe", "no"];
const NEXT = ["callback", "send_role", "submit", "drop", "none"];

// When to call back, as 10 am IST on the chosen day.
function callbackAt(when: string): string | null {
  const days = when === "tomorrow" ? 1 : when === "two_days" ? 2 : when === "next_week" ? 7 : null;
  if (days === null) return null;
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  ist.setUTCDate(ist.getUTCDate() + days);
  ist.setUTCHours(10, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3_600_000).toISOString();
}

// How the call went: three taps, and an optional note. Updates the call, the role's call outcome, and any callback.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; outcome?: unknown; interest?: unknown; next?: unknown; callbackWhen?: unknown; note?: unknown };
  if (typeof b.id !== "string" || typeof b.outcome !== "string" || !OUTCOMES.includes(b.outcome)) return NextResponse.json({ error: "Choose how it went." }, { status: 400 });
  const interest = typeof b.interest === "string" && INTERESTS.includes(b.interest) ? b.interest : null;
  const next = typeof b.next === "string" && NEXT.includes(b.next) ? b.next : null;
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 4000) : null;
  const cbAt = next === "callback" || b.outcome !== "spoke" ? callbackAt(typeof b.callbackWhen === "string" ? b.callbackWhen : "tomorrow") : null;

  const { data: call } = await supabase.from("call_logs").select("candidate_id, mandate_id").eq("id", b.id).eq("recruiter_id", user.id).maybeSingle();
  if (!call) return NextResponse.json({ error: "That call wasn't found." }, { status: 404 });
  const { error } = await supabase
    .from("call_logs")
    .update({ finished_at: new Date().toISOString(), outcome: b.outcome, interest, next_step: next, callback_at: cbAt, note })
    .eq("id", b.id);
  if (error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });

  // Earlier callbacks for this person are answered by this call.
  await supabase.from("call_logs").update({ callback_done: true }).eq("candidate_id", call.candidate_id).eq("recruiter_id", user.id).neq("id", b.id).not("callback_at", "is", null).eq("callback_done", false);

  // The pipeline's own call outcome, where the call was about a role.
  if (call.mandate_id) {
    const disposition = b.outcome === "no_answer" || b.outcome === "busy" ? "not_picked_up" : interest === "no" ? "not_interested" : null;
    if (disposition) await supabase.from("candidate_mandate_links").update({ call_disposition: disposition }).eq("candidate_id", call.candidate_id).eq("mandate_id", call.mandate_id);
  }
  return NextResponse.json({ ok: true, candidateId: call.candidate_id, hasNote: !!note });
}
