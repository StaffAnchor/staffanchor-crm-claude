import SegTabs from "../seg-tabs";
import PerformanceSection from "../performance/section";
import BillingSection from "../billing/section";
import TargetsSection from "../targets/section";

export const dynamic = "force-dynamic";

// Revenue: what came in (overview), what is billed and due (billing), and the financial-year placement targets, in one tab.
const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "billing", label: "Billing" },
  { key: "targets", label: "FY targets" },
];

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? (sp.view as string) : "overview";
  return (
    <>
      <SegTabs base="/analytics/revenue" current={view} views={VIEWS} />
      {view === "billing" ? <BillingSection /> : view === "targets" ? <TargetsSection /> : <PerformanceSection />}
    </>
  );
}
