import AssistBox from "./assist-box";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message StaffAnchor", robots: { index: false, follow: false } };

// A page meant to be shown inside an iframe on staffanchor.com. It is public and
// has no login. It is shown on staffanchor.com only.
export default async function EmbedAssistPage() {
  return (
    <>
      {/* The box is shown inside another site's page, so its own background must not show. */}
      <style>{"html,body{background:transparent !important;}"}</style>
      <AssistBox />
    </>
  );
}
