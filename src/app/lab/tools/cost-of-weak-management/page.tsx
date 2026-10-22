import { ToolFrame, toolContext } from "@/components/lab/tool-page";
import Cost from "./cost";

export const dynamic = "force-dynamic";

export default async function CostPage() {
  const { me, db } = await toolContext();
  const { data } = await db.from("lab_cost_inputs").select("vals").eq("member_id", me.member.id).maybeSingle();
  const initial: Record<string, string> = {};
  for (const [k, x] of Object.entries((data?.vals ?? {}) as Record<string, number | null>)) initial[k] = x == null ? "" : String(x);
  return (
    <ToolFrame me={me} eyebrow="Before session 1" title="The cost of weak sales management" intro="Five numbers that size the problem using your own data, not industry averages. They become part of your baseline. Use the figures from your existing reports.">
      <Cost initial={initial} />
    </ToolFrame>
  );
}
