import SegTabs from "../seg-tabs";
import FlowSection from "../flow/section";
import ScorecardSection from "../../scorecard/section";

export const dynamic = "force-dynamic";

// System health: how fast deals move and how well the AI does (flow), and the quality checks on tagging, page speed and not-a-fit reasons (scorecard).
const VIEWS = [
  { key: "flow", label: "Flow and AI" },
  { key: "quality", label: "Quality checks" },
];

export default async function SystemPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? (sp.view as string) : "flow";
  return (
    <>
      <SegTabs base="/analytics/system" current={view} views={VIEWS} />
      {view === "quality" ? <ScorecardSection /> : <FlowSection />}
    </>
  );
}
