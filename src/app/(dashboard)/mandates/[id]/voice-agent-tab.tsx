import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { evaluateCandidates, loadMandate } from "@/lib/voice/campaign";
import { buildPlan, type CallPlan } from "@/lib/voice/plan";
import { getProvider } from "@/lib/voice/provider";
import VoicePanel, { type VoiceCall, type VoiceCampaignRow } from "./voice-panel";

// The Voice agent tab: who may be called for this role, what the agent would ask each person, draft and approved
// campaigns, and the results. While the provider is not connected it runs in setup mode and places no calls.
export default async function VoiceAgentTab(props: { mandateId: string; canApprove: boolean }) {
  // A problem here must never take the whole role page down with it.
  try {
    return await render(props);
  } catch (e) {
    console.error("Voice agent tab failed", e);
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">The voice agent could not load just now. Reload the page to try again.</p>;
  }
}

async function render({ mandateId, canApprove }: { mandateId: string; canApprove: boolean }) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return <p className="text-[14px] text-slate-500">The voice agent needs the server key to be set up.</p>;
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const supabase = await createClient();
  const mandate = await loadMandate(admin, mandateId);
  if (!mandate) return null;

  const [{ list, links }, camps, calls] = await Promise.all([
    evaluateCandidates(admin, mandateId),
    supabase.from("voice_campaigns").select("id, name, status, name_company, created_at, approved_at").eq("mandate_id", mandateId).order("created_at", { ascending: false }),
    supabase.from("voice_calls").select("id, campaign_id, candidate_id, status, skip_reason, attempts, plan, outcome, applied_at, transcript, candidates(full_name)").eq("mandate_id", mandateId).order("created_at"),
  ]);

  // A sample of exactly what the agent will be told, for the first person who can be called.
  const first = list.find((v) => !v.reason);
  const firstRow = first ? links.find((l) => l.candidate_id === first.candidateId)?.candidates : null;
  const samplePlan: CallPlan | null = firstRow ? buildPlan(firstRow, { role_title: mandate.role_title, cities: mandate.cities, work_mode: mandate.work_mode, client_name: mandate.client_name }, false) : null;

  const provider = process.env.VOICE_PROVIDER === "mock" ? "mock" : "sarvam";
  return (
    <VoicePanel
      mandateId={mandateId}
      roleTitle={mandate.role_title}
      companyName={mandate.client_name}
      candidates={list}
      campaigns={(camps.data ?? []) as VoiceCampaignRow[]}
      calls={(calls.data ?? []) as unknown as VoiceCall[]}
      samplePlan={samplePlan}
      connected={getProvider(provider).configured()}
      provider={provider}
      canApprove={canApprove}
    />
  );
}
