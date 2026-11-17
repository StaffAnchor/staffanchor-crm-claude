import ChatBot from "./chat-bot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat with StaffAnchor", robots: { index: false, follow: false } };

// The chat panel shown inside the floating window on staffanchor.com and jobs.staffanchor.com.
// Public, no login, shows nothing private.
export default async function EmbedChatPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  return <ChatBot site={site === "jobs" ? "jobs" : "main"} />;
}
