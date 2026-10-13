import AssistBox from "./assist-box";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message StaffAnchor", robots: { index: false, follow: false } };

// A page meant to be shown inside an iframe on staffanchor.com and jobs.staffanchor.com. It is public and
// has no login. ?site=jobs tailors the wording for the job-seeker site.
export default async function EmbedAssistPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  return <AssistBox site={site === "jobs" ? "jobs" : "main"} />;
}
