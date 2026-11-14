import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { runDebrief } from "@/lib/debrief";
import { generateBrief } from "@/lib/candidate-brief";
import { isPoolTier } from "@/lib/talent-pool";
import { cleanReadBack, mergeCallMemory } from "@/lib/call-memory";
import { queueProactiveMatchesForCandidate } from "@/lib/proactive-match";
import { yourLevelOptions } from "@/lib/candidate-taxonomy";
import { level1OptionsForProfileType } from "@/lib/candidate-options";
import { BEST_TIMES, CUSTOMER_KINDS, CYCLES, INTERVIEWING, JUDGMENTS, METRICS_OWNED, NOTICE_FLEX, QUOTA_BANDS, REASONS, SERVICE_TYPES, SHIFT_PATTERNS, STYLES, TEAM_HANDLED, WORK_STYLES, type CallSegment } from "@/lib/call-form-options";

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
  ratings?: Record<string, string>;
  segment?: CallSegment;
  messageOk?: boolean | null;
  openness?: string | null;
  note?: string | null;
  callBackAt?: string | null;
  tier?: string | null;
  offer?: { inHand?: boolean; ctc?: number | null } | null;
  // The confirmed read-back of the note: what the system remembers from this call.
  readBack?: unknown;
};

// A spoken call needs a few words about what was discussed, so the person is remembered next time.
const MIN_NOTE = 30;

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
  const { data: me } = await supabase.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const id = body.candidateId ?? "";
  const outcome = body.outcome as Outcome;
  if (!UUID.test(id) || !OUTCOMES.includes(outcome)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if (outcome === "reached" && (typeof body.note !== "string" || body.note.trim().length < MIN_NOTE)) {
    return NextResponse.json({ ok: false, error: "Write a few words about what you discussed before saving the call, rough is fine: what they want, what they will not accept, anything to remember." }, { status: 400 });
  }

  const now = new Date();
  const update: Record<string, unknown> = {};
  const f = body.fields ?? {};
  // The form arrives pre-filled with what is already on the profile, so only what actually changed is written.
  const { data: before } = await supabase
    .from("candidates")
    .select(
      "status, full_name, email, current_variable_ctc, profile_group, segment_data, phone, resume_file_url, current_employer, current_job_title, current_employment_status, total_experience_years, highest_qualification, category, sub_domain, industries, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, open_to_relocation, work_mode"
    )
    .eq("id", id)
    .maybeSingle();
  const was = (before ?? {}) as Record<string, unknown>;
  for (const k of ["current_fixed_ctc", "expected_fixed_ctc", "total_experience_years", "current_variable_ctc"] as const) {
    const v = num(f[k]);
    if (v !== null && Number(was[k] ?? 0) !== v) update[k] = v;
  }
  for (const k of ["notice_period", "current_location", "open_to_relocation", "work_mode", "current_employer", "current_job_title", "current_employment_status", "highest_qualification"] as const) {
    const v = text(f[k]);
    if (v && String(was[k] ?? "").trim() !== v) update[k] = v;
  }
  // Name, email, domain and sub-domain: the other details the registration form collects.
  const name = text(f.full_name);
  if (name && name.length > 2 && String(was.full_name ?? "").trim() !== name) update.full_name = name;
  const email = text(f.email)?.toLowerCase();
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && String(was.email ?? "").trim().toLowerCase() !== email) update.email = email;
  const wasGroup = String(was.profile_group ?? "");
  const group = text(f.profile_group);
  if (group && ["b2b_sales", "b2c_sales", "non_sales"].includes(group) && group !== wasGroup) {
    Object.assign(update, {
      profile_group: group, profile_subgroup: null, sub_group: null, sub_group_locked: false, profile_group_locked: true, profile_group_source: "manual",
      profile_group_confidence: "high", profile_group_reason: `Set by ${me.full_name ?? "a recruiter"} on a call`, profile_group_also: null,
      profile_group_needs_review: false, profile_group_updated_at: now.toISOString(),
    });
  }
  const effectiveGroup = (update.profile_group as string | undefined) ?? wasGroup;
  const sub = text(f.sub_domain);
  if (sub && level1OptionsForProfileType(effectiveGroup).includes(sub) && (String(was.sub_domain ?? "") !== sub || update.profile_group)) update.sub_domain = sub;
  const filled = Object.keys(update).filter((k) => !k.startsWith("profile_group_") && !["profile_subgroup", "sub_group", "sub_group_locked"].includes(k));

  if (outcome === "reached") {
    update.details_confirmed_at = now.toISOString();
    // Shown on the profile as "Confirmed on call <date> by <name>", plus whether they hold an offer.
    const seg: Record<string, unknown> = { ...((was.segment_data as Record<string, unknown> | null) ?? {}), call_confirmed: { at: now.toISOString(), by: me.full_name ?? me.email } };
    if (body.offer?.inHand === true && num(body.offer.ctc)) {
      seg.offer_in_hand = true;
      seg.offer_ctc = num(body.offer.ctc);
    } else if (body.offer?.inHand === false) {
      seg.offer_in_hand = false;
      delete seg.offer_ctc;
    }
    // The level they hold now, and whether that means leading people, the same two answers the registration form records.
    const level = text(f.role_level);
    if (level && level !== String(seg.role_level ?? "")) {
      const known = yourLevelOptions.find((l) => l.value === level);
      if (known) {
        seg.role_level = level;
        seg.role_type = known.lead ? "Team Lead" : "IC";
        filled.push("role_level");
      }
    }
    // The quick-tap answers: why they are looking, flexibility, quota and style, when to call. Only answered ones are written.
    const sg = (body.segment ?? {}) as CallSegment;
    const pick = (v: unknown, allowed: readonly string[]) => (typeof v === "string" && allowed.includes(v) ? v : null);
    const reasons = Array.isArray(sg.reason_for_change) ? sg.reason_for_change.filter((r) => (REASONS as readonly string[]).includes(r)).slice(0, 3) : [];
    if (reasons.length) { seg.reason_for_change = reasons; filled.push("reason_for_change"); }
    const set = (key: keyof CallSegment, v: unknown) => { if (v !== null && v !== undefined) { seg[key] = v; filled.push(key); } };
    set("interviewing_elsewhere", pick(sg.interviewing_elsewhere, INTERVIEWING.map((o) => o.v)));
    set("notice_flex", pick(sg.notice_flex, NOTICE_FLEX.map((o) => o.v)));
    set("quota_last_year", pick(sg.quota_last_year, QUOTA_BANDS));
    set("style", pick(sg.style, STYLES));
    set("cycle", pick(sg.cycle, CYCLES));
    set("best_time_to_call", pick(sg.best_time_to_call, BEST_TIMES));
    if (typeof sg.expected_ctc_negotiable === "boolean") set("expected_ctc_negotiable", sg.expected_ctc_negotiable);
    if (typeof sg.carries_quota === "boolean") set("carries_quota", sg.carries_quota);
    if (typeof sg.can_refer === "boolean") set("can_refer", sg.can_refer);
    // Service and other non-sales answers.
    set("team_handled", pick(sg.team_handled, TEAM_HANDLED));
    set("customer_kind", pick(sg.customer_kind, CUSTOMER_KINDS));
    set("shift_pattern", pick(sg.shift_pattern, SHIFT_PATTERNS));
    set("work_style", pick(sg.work_style, WORK_STYLES));
    const many = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)).slice(0, 3) : []);
    const svc = many(sg.service_type, SERVICE_TYPES);
    if (svc.length) { seg.service_type = svc; filled.push("service_type"); }
    const metrics = many(sg.metrics_owned, METRICS_OWNED);
    if (metrics.length) { seg.metrics_owned = metrics; filled.push("metrics_owned"); }
    if (typeof sg.carries_revenue_target === "boolean") set("carries_revenue_target", sg.carries_revenue_target);
    set("key_tools", text(sg.key_tools));
    set("certifications", text(sg.certifications));
    // Consent to be messaged about roles: yes switches WhatsApp and email on, no switches both off.
    if (typeof body.messageOk === "boolean") {
      update.whatsapp_opt_in = body.messageOk;
      update.email_opt_out = !body.messageOk;
      filled.push("message_consent");
    }
    // What the call taught us about the person is remembered for matching: the confirmed read-back, or the note itself
    // if the read-back was skipped.
    const noteText = typeof body.note === "string" ? body.note.trim() : "";
    const memory = cleanReadBack(body.readBack) ?? (noteText ? { summary: noteText.slice(0, 280) } : null);
    if (memory) {
      seg.call_insights = mergeCallMemory(seg.call_insights, memory, now.toISOString());
      update.updated_at = now.toISOString();
    }
    update.segment_data = seg;
    // A lead whose details are now complete becomes Registered, the same gate the public form uses.
    if (was.status === "lead" || was.status === "awaiting_input") {
      const m = { ...was, ...update } as Record<string, unknown>;
      const has = (v: unknown) => v !== null && v !== undefined && v !== "";
      const required = ["phone", "current_location", "resume_file_url", "current_employer", "current_job_title", "current_employment_status", "total_experience_years", "current_fixed_ctc", "expected_fixed_ctc", "notice_period", "highest_qualification", "category", "sub_domain", "work_mode", "open_to_relocation"];
      if (required.every((k) => has(m[k])) && Array.isArray(m.industries) && m.industries.length > 0) update.status = "registered";
    }
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
  // How they came across: up to five good / okay / weak judgments, saved as one rating row for this call.
  const communication = body.communication;
  if (outcome === "reached") {
    const row: Record<string, string> = {};
    for (const j of JUDGMENTS) {
      const v = j.key === "communication" ? body.ratings?.communication ?? communication : body.ratings?.[j.key];
      if (v === "good" || v === "okay" || v === "weak") row[j.key] = v;
    }
    if (Object.keys(row).length) await supabase.from("candidate_call_ratings").insert({ candidate_id: id, rated_by: user.id, ...row });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
  // "After the call": the same reading the profile page does. The note fills any detail still blank (never overwriting
  // what was just typed above), saves ratings it supports, sets the Talent Pool verdict, and logs the call; then the
  // client brief is rewritten and strong people are matched against open roles. Other outcomes keep a plain note.
  // Reading the note takes the AI several seconds, so the call is saved and answered straight away and the reading happens
  // in the background: the blanks it fills, the Talent Pool verdict, the client brief and the role matches follow within a
  // minute. Waiting for it made every saved call feel slow, and a slow connection made it worse.
  let reading = false;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (outcome === "reached" && note.length >= 8 && serviceKey) {
    reading = true;
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
    const tier = isPoolTier(body.tier) ? body.tier : null;
    after(async () => {
      const r = await runDebrief(admin, { candidateId: id, authorId: user.id, note, tier }).catch(() => null);
      if (r && r.ok) {
        await generateBrief(admin, id).catch(() => {});
        await queueProactiveMatchesForCandidate(id, admin).catch(() => {});
      } else {
        await admin.from("recruiter_notes").insert({ candidate_id: id, author_id: user.id, note_type: "call_note", content: note });
      }
    });
  } else if (note) {
    await supabase.from("recruiter_notes").insert({ candidate_id: id, author_id: user.id, note_type: "call_note", content: note });
  }

  const callBackAt = outcome === "call_later" && body.callBackAt && !Number.isNaN(Date.parse(body.callBackAt)) ? new Date(body.callBackAt).toISOString() : null;
  const { error: logError } = await supabase.from("call_log").insert({ candidate_id: id, caller_id: user.id, outcome, note: note || null, call_back_at: callBackAt, fields_filled: filled });
  if (logError) return NextResponse.json({ ok: false, error: `Saved the profile, but couldn't log the call: ${logError.message}` }, { status: 500 });
  await supabase.from("audit_log").insert({ actor: user.id, action: "call_logged", entity: "candidate", entity_id: id, detail: { outcome, filled, communication: communication ?? null, openness: body.openness ?? null } });

  // What is still not on the profile after this call, so the recruiter can finish it while the person is fresh in mind.
  let stillMissing: string[] | undefined;
  if (outcome === "reached") {
    const { data: rd } = await supabase.rpc("people_readiness", { p_ids: [id] });
    const row = ((rd ?? []) as { gaps: string[] }[])[0];
    if (row) stillMissing = row.gaps;
  }
  return NextResponse.json({ ok: true, filled, debrief: null, reading, stillMissing });
}
