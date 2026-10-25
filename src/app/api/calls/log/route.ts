import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { runDebrief } from "@/lib/debrief";
import { generateBrief } from "@/lib/candidate-brief";
import { isPoolTier } from "@/lib/talent-pool";
import { queueProactiveMatchesForCandidate } from "@/lib/proactive-match";

export const runtime = "nodejs";
export const maxDuration = 60;

// One call, recorded once: what the candidate said goes straight onto their profile, how they came across is saved as a
// call rating, and the outcome is logged so the daily call list knows who to show next (and who not to call again yet).
const OUTCOMES = ["reached", "no_answer", "call_later", "not_interested", "wrong_number"] as const;
type Outcome = (typeof OUTCOMES)[number];
const UUID = /^[0-9a-f-]{36}$/i;
const DAY = 86_400_000;

type Body = {
  candidateId?: string;
  outcome?: string;
  fields?: Record<string, unknown>;
  communication?: string | null;
  openness?: string | null;
  note?: string | null;
  callBackAt?: string | null;
  tier?: string | null;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const id = body.candidateId ?? "";
  const outcome = body.outcome as Outcome;
  if (!UUID.test(id) || !OUTCOMES.includes(outcome)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const now = new Date();
  const update: Record<string, unknown> = {};
  const f = body.fields ?? {};
  // The form arrives pre-filled with what is already on the profile, so only what actually changed is written.
  const { data: before } = await supabase.from("candidates").select("current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, open_to_relocation, work_mode").eq("id", id).maybeSingle();
  const was = (before ?? {}) as Record<string, unknown>;
  for (const k of ["current_fixed_ctc", "expected_fixed_ctc"] as const) {
    const v = num(f[k]);
    if (v !== null && Number(was[k] ?? 0) !== v) update[k] = v;
  }
  for (const k of ["notice_period", "current_location", "open_to_relocation", "work_mode"] as const) {
    const v = text(f[k]);
    if (v && String(was[k] ?? "").trim() !== v) update[k] = v;
  }
  const filled = Object.keys(update);

  if (outcome === "reached") {
    update.details_confirmed_at = now.toISOString();
    if (body.openness === "Looking") {
      update.open_to_work_at = now.toISOString();
      update.not_now_until = null;
    } else if (body.openness === "Not now") {
      update.not_now_until = new Date(now.getTime() + 90 * DAY).toISOString();
    }
  }
  if (outcome === "not_interested") update.not_now_until = new Date(now.getTime() + 90 * DAY).toISOString();

  if (Object.keys(update).length) {
    const { error } = await supabase.from("candidates").update(update).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: `Couldn't save the profile: ${error.message}` }, { status: 500 });
  }
  const communication = body.communication;
  if (outcome === "reached" && (communication === "good" || communication === "okay" || communication === "weak")) {
    await supabase.from("candidate_call_ratings").insert({ candidate_id: id, rated_by: user.id, communication });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
  // "After the call": the same reading the profile page does. The note fills any detail still blank (never overwriting
  // what was just typed above), saves ratings it supports, sets the Talent Pool verdict, and logs the call; then the
  // client brief is rewritten and strong people are matched against open roles. Other outcomes keep a plain note.
  let debrief: { summary: string; filled: string[]; tier: string | null; concerns: string[] } | null = null;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (outcome === "reached" && note.length >= 8 && serviceKey) {
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
    const r = await runDebrief(admin, { candidateId: id, authorId: user.id, note, tier: isPoolTier(body.tier) ? body.tier : null });
    if (r.ok) {
      debrief = { summary: r.debrief.summary, filled: r.applied.filled.map((f) => `${f.label}: ${f.value}`), tier: r.applied.tier, concerns: r.debrief.concerns };
      after(async () => {
        await generateBrief(admin, id);
        await queueProactiveMatchesForCandidate(id, admin).catch(() => {});
      });
    } else {
      await supabase.from("recruiter_notes").insert({ candidate_id: id, author_id: user.id, note_type: "call_note", content: note });
    }
  } else if (note) {
    await supabase.from("recruiter_notes").insert({ candidate_id: id, author_id: user.id, note_type: "call_note", content: note });
  }

  const callBackAt = outcome === "call_later" && body.callBackAt && !Number.isNaN(Date.parse(body.callBackAt)) ? new Date(body.callBackAt).toISOString() : null;
  const { error: logError } = await supabase.from("call_log").insert({ candidate_id: id, caller_id: user.id, outcome, note: note || null, call_back_at: callBackAt, fields_filled: filled });
  if (logError) return NextResponse.json({ ok: false, error: `Saved the profile, but couldn't log the call: ${logError.message}` }, { status: 500 });
  await supabase.from("audit_log").insert({ actor: user.id, action: "call_logged", entity: "candidate", entity_id: id, detail: { outcome, filled, communication: communication ?? null, openness: body.openness ?? null } });

  return NextResponse.json({ ok: true, filled, debrief });
}
