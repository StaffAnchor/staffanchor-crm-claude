import { redirect } from "next/navigation";

// Calls today was folded into Profile completion: the priority calls (paid, said yes, call-backs, urgent roles) now come first
// in "Today's calls" there, followed by everyone missing vitals. Old links and bookmarks land there.
export default function CallsTodayPage() {
  redirect("/candidates/complete?sub=priority");
}
