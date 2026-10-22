import { ToolFrame, toolContext } from "@/components/lab/tool-page";
import { ONBOARDING_DEFAULT } from "@/lib/lab/calc";
import Onboarding, { type Saved, type Week } from "./onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { me, db } = await toolContext();
  const { data } = await db.from("lab_onboarding").select("id, rep_ref, started_on, plan, weeks").eq("member_id", me.member.id).order("started_on", { ascending: false });
  const saved: Saved[] = ((data ?? []) as { id: string; rep_ref: string; started_on: string; plan: Saved["plan"]; weeks: Week[] }[]).map((r) => ({ id: r.id, repRef: r.rep_ref, startedOn: r.started_on, plan: { ...JSON.parse(JSON.stringify(ONBOARDING_DEFAULT)), ...r.plan }, weeks: r.weeks ?? [] }));
  return (
    <ToolFrame me={me} eyebrow="Session 5" title="New Rep Onboarding 30-60-90" intro="A plan for a new rep's first 90 days: what they learn, what they do, and what they prove, with a short weekly check. Use the rep's ID only.">
      <Onboarding saved={saved} />
    </ToolFrame>
  );
}
