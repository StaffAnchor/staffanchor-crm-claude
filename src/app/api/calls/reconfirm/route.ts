import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// "Still accurate": the last call on this person still stands. It restarts the 60 days the share check looks at
// (segment_data.call_confirmed.at), without a new call or note. It speaks for the person only: a role's own review
// (interested, each must-have) is never touched here. After 60 days the form may send the three things that go stale
// (notice, expected pay, open to work) and they are saved too.
const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { candidateId?: string; notice_period?: string; expected_fixed_ctc?: unknown; openness?: string };
  const id = body.candidateId ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data: was } = await supabase.from("candidates").select("segment_data, notice_period, expected_fixed_ctc").eq("id", id).maybeSingle();
  const seg = (was?.segment_data ?? null) as Record<string, unknown> | null;
  const prev = seg?.call_confirmed as { at?: string } | undefined;
  if (!was || !prev?.at) return NextResponse.json({ ok: false, error: "There is no earlier call on this person to confirm. Record a call instead." }, { status: 400 });

  const now = new Date();
  const update: Record<string, unknown> = {
    details_confirmed_at: now.toISOString(),
    segment_data: { ...seg, call_confirmed: { at: now.toISOString(), by: me.full_name ?? me.email, kind: "reconfirmed" } },
  };
  const changed: string[] = [];
  const notice = typeof body.notice_period === "string" ? body.notice_period.trim().slice(0, 40) : "";
  if (notice && notice !== String(was.notice_period ?? "")) { update.notice_period = notice; changed.push("notice_period"); }
  const pay = num(body.expected_fixed_ctc);
  if (pay !== null && pay !== Number(was.expected_fixed_ctc ?? 0)) { update.expected_fixed_ctc = pay; changed.push("expected_fixed_ctc"); }
  if (body.openness === "Looking") { update.open_to_work_at = now.toISOString(); update.not_now_until = null; changed.push("open_to_work"); }
  else if (body.openness === "Not now") { update.not_now_until = new Date(now.getTime() + 90 * 86_400_000).toISOString(); changed.push("not_now"); }

  const { error } = await supabase.from("candidates").update(update).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: `Couldn't save: ${error.message}` }, { status: 500 });
  await supabase.from("audit_log").insert({ actor: user.id, action: "call_reconfirmed", entity: "candidate", entity_id: id, detail: { previous: prev.at, changed } });
  return NextResponse.json({ ok: true, changed });
}
