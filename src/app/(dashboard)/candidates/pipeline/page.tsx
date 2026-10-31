import { redirect } from "next/navigation";

// Improve profiles was folded into Profile completion, which shows what is missing by group, practice and city and
// holds the bulk asking on WhatsApp. Old links and bookmarks land there.
export default function PipelinePage() {
  redirect("/candidates/complete");
}
