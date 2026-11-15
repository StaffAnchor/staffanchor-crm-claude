import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCallMemory } from "@/lib/call-memory";
import type { VoiceOutcome } from "@/lib/voice/read";

// Writes what a voice-agent call learned. It fills only blanks: the agent never overwrites a value a person gave or a
// recruiter confirmed, and it never marks details as confirmed, so a recruiter still verifies them before the profile can
// go to the client. What the person wants and will not accept goes into the call memory used for matching.

type CallRow = { id: string; candidate_id: string; mandate_id: string };
const FIELDS = ["current_fixed_ctc", "current_variable_ctc", "expected_fixed_ctc", "total_experience_years", "notice_period", "current_location", "open_to_relocation", "current_employer", "current_job_title"] as const;

export async function applyVoiceOutcome(admin: SupabaseClient, call: CallRow, transcript: string, outcome: VoiceOutcome): Promise<{ filled: string[] }> {
  const now = new Date().toISOString();
  const { proposal: p, extra } = outcome;
  const { data: cand } = await admin.from("candidates").select(`${FIELDS.join(", ")}, segment_data`).eq("id", call.candidate_id).maybeSingle();
  if (!cand) return { filled: [] };
  const cur = cand as unknown as Record<string, unknown>;

  // Blanks only.
  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  for (const k of FIELDS) {
    const next = (p.fields as Record<string, unknown>)[k];
    const have = cur[k];
    if (next !== undefined && (have === null || have === undefined || have === "")) {
      patch[k] = next;
      filled.push(k);
    }
  }

  const seg = (cur.segment_data && typeof cur.segment_data === "object" ? cur.segment_data : {}) as Record<string, unknown>;
  const concerns: string[] = [];
  if (extra.interviewedByClient === "yes") concerns.push(`Already interviewed with this client${extra.interviewedWhen ? ` (${extra.interviewedWhen})` : ""}`);
  if (extra.inTouchWithClient === "yes") concerns.push("Already in touch with this client about the role");
  const memory = mergeCallMemory(seg.call_insights, { summary: p.summary, wants: p.preferred, dealbreakers: p.dealbreakers, concerns, other_offers: p.otherOffers, unclear: p.unclear }, now);
  const nextSeg: Record<string, unknown> = { ...seg, call_insights: p.summary || p.preferred.length || p.dealbreakers.length || concerns.length ? memory : seg.call_insights };
  if (filled.length) nextSeg.voice_collected = { at: now, call_id: call.id, mandate_id: call.mandate_id, fields: filled, note: "Collected by the voice agent; a recruiter still confirms before the profile goes to the client." };
  patch.segment_data = nextSeg;
  if (extra.doNotCall) patch.voice_opt_out_at = now;
  await admin.from("candidates").update(patch).eq("id", call.candidate_id);

  if (p.interest) {
    await admin.from("candidate_role_interest").upsert({ candidate_id: call.candidate_id, mandate_id: call.mandate_id, interest: p.interest.level, reason: p.interest.reason, source: "call", updated_at: now }, { onConflict: "candidate_id,mandate_id" });
  }

  const { data: insight } = await admin
    .from("call_insights")
    .insert({ candidate_id: call.candidate_id, mandate_id: call.mandate_id, source: "voice_agent", transcript: transcript.slice(0, 20000), summary: p.summary, proposal: p, applied_at: now })
    .select("id")
    .single();
  await admin.from("voice_calls").update({ outcome, applied_at: now, insight_id: (insight as { id: string } | null)?.id ?? null }).eq("id", call.id);
  return { filled };
}
