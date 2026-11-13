import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { FIELD_LABEL, readCallTranscript, type CallProposal } from "@/lib/call-transcript";
import { bestRoleFits } from "@/lib/candidate-role-fit";
import { POST as logCall } from "@/app/api/calls/log/route";

export const runtime = "nodejs";
export const maxDuration = 60;

// Reads a call (pasted notes or transcript, and later the voice agent's) and, once a person has checked it, writes what
// it settled onto the profile. Reading saves nothing on the profile. Applying goes through the same save the call form
// uses, so confirming details, consent, the debrief and the role matching happen in exactly one place.
const UUID = /^[0-9a-f-]{36}$/i;

type Accept = { fields?: string[]; segment?: boolean; ratings?: boolean; messageOk?: boolean; openness?: boolean; selling?: boolean; interest?: boolean; notes?: boolean };

const same = (a: unknown, b: unknown) => (typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase());

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { mode?: string; candidateId?: string; transcript?: string; mandateId?: string | null; insightId?: string; accept?: Accept };
  const candidateId = body.candidateId ?? "";
  if (!UUID.test(candidateId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const mandateId = body.mandateId && UUID.test(body.mandateId) ? body.mandateId : null;

  // ---- Read: propose, save nothing on the profile ----
  if (body.mode === "read") {
    const read = await readCallTranscript(admin, { candidateId, transcript: body.transcript ?? "", mandateId });
    if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
    const p = read.proposal;
    const { data: cur } = await admin
      .from("candidates")
      .select("current_fixed_ctc, current_variable_ctc, expected_fixed_ctc, total_experience_years, notice_period, current_location, open_to_relocation, current_employer, current_job_title, verification_level")
      .eq("id", candidateId)
      .maybeSingle();
    const was = (cur ?? {}) as Record<string, unknown>;
    const verified = Number(was.verification_level ?? 0) >= 2;
    const changes = Object.entries(p.fields)
      .map(([key, next]) => {
        const current = was[key] ?? null;
        const blank = current === null || current === undefined || current === "";
        if (!blank && same(current, next)) return null;
        // A value someone reference-checked is not replaced unless they choose to.
        return { key, label: FIELD_LABEL[key] ?? key, current, next, kind: blank ? "new" : "changed", defaultOn: blank || !verified };
      })
      .filter(Boolean);
    const { data: row, error } = await admin
      .from("call_insights")
      .insert({ candidate_id: candidateId, mandate_id: mandateId, source: "pasted", transcript: (body.transcript ?? "").trim().slice(0, 20000), summary: p.summary, proposal: p, created_by: user.id })
      .select("id")
      .single();
    if (error || !row) return NextResponse.json({ error: "Couldn't save the reading." }, { status: 500 });
    return NextResponse.json({ ok: true, insightId: row.id, proposal: p, changes });
  }

  // ---- Apply: write the checked parts ----
  if (body.mode === "apply") {
    const insightId = body.insightId ?? "";
    if (!UUID.test(insightId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const { data: insight } = await admin.from("call_insights").select("id, candidate_id, mandate_id, proposal, applied_at, summary").eq("id", insightId).maybeSingle();
    if (!insight || insight.candidate_id !== candidateId) return NextResponse.json({ error: "Reading not found" }, { status: 404 });
    if (insight.applied_at) return NextResponse.json({ error: "This reading was already applied." }, { status: 409 });
    const p = insight.proposal as CallProposal;
    const accept = body.accept ?? {};
    const roleId = (insight.mandate_id as string | null) ?? null;

    const fields: Record<string, unknown> = {};
    for (const k of accept.fields ?? []) if (k in p.fields) fields[k] = (p.fields as Record<string, unknown>)[k];

    const noteParts = [p.summary];
    if (accept.notes !== false) {
      if (p.dealbreakers.length) noteParts.push(`Will not accept: ${p.dealbreakers.join("; ")}.`);
      if (p.preferred.length) noteParts.push(`Wants: ${p.preferred.join("; ")}.`);
      if (p.otherOffers) noteParts.push(`Other offers: ${p.otherOffers}.`);
      if (p.unclear.length) noteParts.push(`Still unclear: ${p.unclear.join("; ")}.`);
    }
    let note = noteParts.filter(Boolean).join(" ").slice(0, 3900);
    if (note.length < 40) note = `${note} (read from a call transcript)`.trim();
    const logBody = {
      candidateId,
      outcome: "reached",
      fields,
      segment: accept.segment ? p.segment : {},
      ratings: accept.ratings ? p.ratings : {},
      communication: accept.ratings ? p.ratings.communication ?? null : null,
      messageOk: accept.messageOk && p.messageOk !== null ? p.messageOk : null,
      openness: accept.openness ? p.openness : null,
      note,
      // What the call taught us is remembered for matching, through the same save the call form uses.
      readBack: accept.notes !== false ? { summary: p.summary, wants: p.preferred, dealbreakers: p.dealbreakers, other_offers: p.otherOffers, unclear: p.unclear } : { summary: p.summary },
    };
    const headers = new Headers({ "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" });
    const res = await logCall(new Request(new URL("/api/calls/log", req.url), { method: "POST", headers, body: JSON.stringify(logBody) }));
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; filled?: string[]; stillMissing?: string[] };
    if (!res.ok || out.ok === false) return NextResponse.json({ error: out.error ?? "Couldn't save to the profile." }, { status: res.status >= 400 ? res.status : 500 });

    const now = new Date().toISOString();
    // What they sell: written as a call-sourced selling profile, which the AI sweep never overwrites, so the role
    // matching uses it straight away.
    if (accept.selling && p.selling) {
      const { data: old } = await admin.from("candidate_selling_profiles").select("*").eq("candidate_id", candidateId).maybeSingle();
      const o = (old ?? {}) as Record<string, unknown>;
      const s = p.selling;
      const fresh = s.worlds.length > 0 || s.customer_types.length > 0;
      await admin.from("candidate_selling_profiles").upsert(
        {
          candidate_id: candidateId,
          worlds: s.worlds.length ? s.worlds : o.worlds ?? [],
          customer_types: s.customer_types.length ? s.customer_types : o.customer_types ?? [],
          // A fresh picture of what they sell replaces the old buyer roles and team description, which would otherwise
          // contradict it.
          buyer_roles: fresh ? [] : o.buyer_roles ?? [],
          motion: s.motion ?? o.motion ?? null,
          deal_size: s.deal_size ?? o.deal_size ?? null,
          quota: s.quota ?? o.quota ?? null,
          team_size: s.team_size ?? o.team_size ?? null,
          team_sells: fresh ? null : o.team_sells ?? null,
          summary: s.sells ?? o.summary ?? null,
          evidence: "Said on a call",
          confidence: 0.9,
          source: "call",
          generated_at: now,
        },
        { onConflict: "candidate_id" }
      );
    }
    // What they said about this role, so they are not called again for it if they said no.
    if (accept.interest && p.interest && roleId) {
      await admin.from("candidate_role_interest").upsert({ candidate_id: candidateId, mandate_id: roleId, interest: p.interest.level, reason: p.interest.reason, source: "call", updated_at: now }, { onConflict: "candidate_id,mandate_id" });
    }
    await admin.from("call_insights").update({ applied_at: now, applied_by: user.id }).eq("id", insightId);
    const fits = await bestRoleFits(admin, candidateId, 3).catch(() => []);
    return NextResponse.json({ ok: true, filled: out.filled ?? [], stillMissing: out.stillMissing ?? [], fits });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
