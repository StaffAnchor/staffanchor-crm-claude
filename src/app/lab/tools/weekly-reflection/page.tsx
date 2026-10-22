import { ToolFrame, toolContext } from "@/components/lab/tool-page";
import Reflection, { type Saved } from "./reflection";

export const dynamic = "force-dynamic";

export default async function WeeklyReflectionPage() {
  const { me, db } = await toolContext();
  const { data } = await db.from("lab_reflections").select("id, week_ending, mattered, evidence, slipped, cause, action, help_from, check_next").eq("member_id", me.member.id).order("week_ending", { ascending: false });
  const saved: Saved[] = ((data ?? []) as { id: string; week_ending: string; mattered: string | null; evidence: string | null; slipped: string | null; cause: string | null; action: string | null; help_from: string | null; check_next: string | null }[]).map((r) => ({ id: r.id, weekEnding: r.week_ending, mattered: r.mattered ?? "", evidence: r.evidence ?? "", slipped: r.slipped ?? "", cause: r.cause ?? "", action: r.action ?? "", helpFrom: r.help_from ?? "", checkNext: r.check_next ?? "" }));
  return (
    <ToolFrame me={me} eyebrow="Every week" title="Weekly Reflection" intro="A five-minute note after your regular team review: what mattered, where execution slipped, the likely cause, and one action. The habit matters more than the length.">
      <Reflection saved={saved} />
    </ToolFrame>
  );
}
