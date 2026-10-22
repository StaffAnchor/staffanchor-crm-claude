import { CADENCE_DEFAULTS } from "@/lib/lab/calc";
import { ToolFrame, toolContext } from "@/components/lab/tool-page";
import Cadence, { type Check, type Rule } from "./cadence";

export const dynamic = "force-dynamic";

export default async function FollowUpCadencePage() {
  const { me, db } = await toolContext();
  const [{ data: rules }, { data: checks }] = await Promise.all([
    db.from("lab_cadence_rules").select("stage, within_time, channel, purpose, owner, quiet_rule").eq("member_id", me.member.id).order("position"),
    db.from("lab_cadence_checks").select("id, week_ending, sampled, with_next_step, reason, fix").eq("member_id", me.member.id).order("week_ending", { ascending: false }),
  ]);
  const saved: Rule[] = ((rules ?? []) as { stage: string | null; within_time: string | null; channel: string | null; purpose: string | null; owner: string | null; quiet_rule: string | null }[]).map((r) => ({ stage: r.stage ?? "", within: r.within_time ?? "", channel: r.channel ?? "", purpose: r.purpose ?? "", owner: r.owner ?? "", quiet: r.quiet_rule ?? "" }));
  const list: Check[] = ((checks ?? []) as { id: string; week_ending: string; sampled: number; with_next_step: number; reason: string | null; fix: string | null }[]).map((c) => ({ id: c.id, weekEnding: c.week_ending, sampled: c.sampled, withNextStep: c.with_next_step, reason: c.reason ?? "", fix: c.fix ?? "" }));
  return (
    <ToolFrame me={me} wide eyebrow="Session 2" title="Follow-up Cadence" intro="Set a standard follow-up rhythm by stage, so follow-up does not depend on the individual rep, then check it each week: of the deals you sample, how many have a dated next step.">
      <Cadence rules={saved.length ? saved : CADENCE_DEFAULTS.map((d) => ({ stage: d.stage, within: d.within, channel: d.channel, purpose: d.purpose, owner: d.owner, quiet: d.quiet }))} checks={list} />
    </ToolFrame>
  );
}
