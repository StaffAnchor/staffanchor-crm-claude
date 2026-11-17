import ChatBot from "./chat-bot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat with StaffAnchor", robots: { index: false, follow: false } };

// The chat panel shown inside the floating window on staffanchor.com and jobs.staffanchor.com.
// Public, no login, shows nothing private.
export default async function EmbedChatPage({ searchParams }: { searchParams: Promise<{ site?: string; job?: string }> }) {
  const { site, job } = await searchParams;
  // The loader passes the role's title only on a job page. It is shown as plain text, never as markup.
  const jobTitle = site === "jobs" && job ? job.replace(/\s+/g, " ").trim().slice(0, 80) : undefined;
  return <ChatBot site={site === "jobs" ? "jobs" : "main"} job={jobTitle || undefined} />;
}
