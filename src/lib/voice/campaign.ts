import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlan, gapsFor, type CallPlan, type GapKey } from "@/lib/voice/plan";
import { skipReason } from "@/lib/voice/policy";

// Works out, for one role, who the voice agent may call and what it would ask each person, and turns a chosen list into a
// draft campaign. Nothing is dialled here.

const SELF_SERVED = new Set(["quick_apply", "self_registration", "candidate_self_signup"]);

export type VoiceCandidate = {
  candidateId: string;
  name: string;
  hasPhone: boolean;
  score: number | null;
  recommendation: string | null;
  stage: string;
  applied: boolean;
  /** Why they cannot be called, or null. */
  reason: string | null;
  gaps: GapKey[];
};

type Link = {
  candidate_id: string;
  stage: string;
  in_shortlist: boolean;
  added_by: string | null;
  match_source: string | null;
  call_paid_at: string | null;
  match_score: number | null;
  match_assessment: { recommendation?: string } | null;
  candidates: {
    id: string;
    full_name: string | null;
    phone: string | null;
    phone_hold: boolean | null;
    voice_opt_out_at: string | null;
    created_by: string | null;
    current_fixed_ctc: number | null;
    expected_fixed_ctc: number | null;
    notice_period: string | null;
    open_to_relocation: string | null;
    current_location: string | null;
    work_mode: string | null;
  } | null;
};

export type MandateForVoice = { id: string; role_title: string; cities: string[] | null; work_mode: string | null; client_name: string | null; show_client_name: boolean | null };

export async function loadMandate(admin: SupabaseClient, mandateId: string): Promise<MandateForVoice | null> {
  const { data } = await admin.from("mandates").select("id, role_title, cities, work_mode, client_name, show_client_name").eq("id", mandateId).maybeSingle();
  return (data as MandateForVoice | null) ?? null;
}

async function loadLinks(admin: SupabaseClient, mandateId: string, only?: string[]) {
  let q = admin
    .from("candidate_mandate_links")
    .select("candidate_id, stage, in_shortlist, added_by, match_source, call_paid_at, match_score, match_assessment, candidates(id, full_name, phone, phone_hold, voice_opt_out_at, created_by, current_fixed_ctc, expected_fixed_ctc, notice_period, open_to_relocation, current_location, work_mode)")
    .eq("mandate_id", mandateId);
  if (only?.length) q = q.in("candidate_id", only);
  const { data } = await q;
  return ((data ?? []) as unknown as Link[]).filter((l) => l.candidates);
}

export async function evaluateCandidates(admin: SupabaseClient, mandateId: string, only?: string[]): Promise<{ list: VoiceCandidate[]; links: Link[] }> {
  const links = await loadLinks(admin, mandateId, only);
  const ids = links.map((l) => l.candidate_id);
  const [answers, interests, calls] = await Promise.all([
    admin.from("mandate_application_answers").select("candidate_id").eq("mandate_id", mandateId).in("candidate_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    admin.from("candidate_role_interest").select("candidate_id, interest").eq("mandate_id", mandateId),
    admin.from("voice_calls").select("candidate_id, last_attempt_at").in("candidate_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).not("last_attempt_at", "is", null).order("last_attempt_at", { ascending: false }),
  ]);
  const answered = new Set(((answers.data ?? []) as { candidate_id: string }[]).map((a) => a.candidate_id));
  const interest = new Map(((interests.data ?? []) as { candidate_id: string; interest: string }[]).map((i) => [i.candidate_id, i.interest]));
  const last = new Map<string, string>();
  for (const c of (calls.data ?? []) as { candidate_id: string; last_attempt_at: string }[]) if (!last.has(c.candidate_id)) last.set(c.candidate_id, c.last_attempt_at);
  const now = new Date();

  const list = links.map((l): VoiceCandidate => {
    const c = l.candidates!;
    // Applied = they came in through the job link or form and no recruiter put them there (the same rule as the pipeline's source chip).
    const applied = !l.added_by && (answered.has(c.id) || !!l.call_paid_at || (!!c.created_by && SELF_SERVED.has(c.created_by) && l.match_source !== "pipeline_backfill"));
    const recommendation = l.match_assessment?.recommendation ?? null;
    const reason = skipReason({ phone: c.phone, phoneHold: c.phone_hold, voiceOptOutAt: c.voice_opt_out_at, stage: l.stage, inShortlist: l.in_shortlist, applied, score: l.match_score, recommendation, interest: interest.get(c.id) ?? null, lastAttemptAt: last.get(c.id) ?? null, now });
    return { candidateId: c.id, name: c.full_name ?? "Unnamed", hasPhone: !!c.phone, score: l.match_score, recommendation, stage: l.stage, applied, reason, gaps: gapsFor(c) };
  });
  list.sort((a, b) => Number(a.reason !== null) - Number(b.reason !== null) || (b.score ?? -1) - (a.score ?? -1));
  return { list, links };
}

/** A draft campaign for the chosen people. Anyone who fails the rules is kept in it as skipped, with the reason. */
export async function createDraftCampaign(admin: SupabaseClient, input: { mandate: MandateForVoice; candidateIds: string[]; name: string; nameCompany: boolean; userId: string; provider: string }) {
  const { mandate, candidateIds } = input;
  const { list, links } = await evaluateCandidates(admin, mandate.id, candidateIds);
  const byId = new Map(links.map((l) => [l.candidate_id, l.candidates!]));
  const { data: camp, error } = await admin
    .from("voice_campaigns")
    .insert({ mandate_id: mandate.id, name: input.name, name_company: input.nameCompany, provider: input.provider, created_by: input.userId })
    .select("id")
    .single();
  if (error || !camp) throw new Error("Couldn't create the campaign.");
  const rows = list.map((v) => {
    const c = byId.get(v.candidateId)!;
    const plan: CallPlan = buildPlan(c, { role_title: mandate.role_title, cities: mandate.cities, work_mode: mandate.work_mode, client_name: mandate.client_name }, input.nameCompany);
    return {
      campaign_id: (camp as { id: string }).id,
      candidate_id: v.candidateId,
      mandate_id: mandate.id,
      status: v.reason ? "skipped" : "queued",
      skip_reason: v.reason,
      plan,
    };
  });
  if (rows.length) await admin.from("voice_calls").insert(rows);
  return { campaignId: (camp as { id: string }).id, queued: rows.filter((r) => r.status === "queued").length, skipped: rows.filter((r) => r.status === "skipped").length };
}
