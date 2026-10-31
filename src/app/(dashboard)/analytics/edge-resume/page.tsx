import SegTabs from "../seg-tabs";
import EdgeSection from "../edge/section";
import ResumeOrdersSection from "../resume-orders/section";

export const dynamic = "force-dynamic";

// StaffAnchor Edge (sessions and CV reviews) and resume orders: the two services candidates pay for, in one tab.
const VIEWS = [
  { key: "edge", label: "StaffAnchor Edge" },
  { key: "resume", label: "Resume orders" },
];

export default async function EdgeResumePage({ searchParams }: { searchParams: Promise<{ view?: string; gcal?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? (sp.view as string) : "edge";
  return (
    <>
      <SegTabs base="/analytics/edge-resume" current={view} views={VIEWS} />
      {view === "resume" ? <ResumeOrdersSection /> : <EdgeSection searchParams={Promise.resolve({ gcal: sp.gcal })} />}
    </>
  );
}
