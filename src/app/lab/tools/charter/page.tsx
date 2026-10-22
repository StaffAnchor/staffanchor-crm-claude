import { ToolFrame, toolContext } from "@/components/lab/tool-page";
import Charter, { type Item } from "./charter";

export const dynamic = "force-dynamic";

export default async function CharterPage() {
  const { me, db } = await toolContext();
  const { data } = await db.from("lab_charter_items").select("position, problem, evidence, baseline, desired, experiment, owner, review_on, result, next_step").eq("member_id", me.member.id).order("position");
  const items: Item[] = [];
  for (const r of (data ?? []) as { position: number; problem: string | null; evidence: string | null; baseline: string | null; desired: string | null; experiment: string | null; owner: string | null; review_on: string | null; result: string | null; next_step: string | null }[]) {
    items[r.position - 1] = { problem: r.problem ?? "", evidence: r.evidence ?? "", baseline: r.baseline ?? "", desired: r.desired ?? "", experiment: r.experiment ?? "", owner: r.owner ?? "", reviewOn: r.review_on ?? "", result: r.result ?? "", nextStep: r.next_step ?? "" };
  }
  return (
    <ToolFrame me={me} eyebrow="Session 6" title="90-Day Improvement Charter" intro="One management habit to improve, tested with a small experiment over 90 days, with a review date and a recorded result.">
      <Charter initial={items} />
    </ToolFrame>
  );
}
