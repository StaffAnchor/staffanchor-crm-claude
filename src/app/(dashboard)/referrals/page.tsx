import { redirect } from "next/navigation";

// Moved under /candidates/referrals (Sep 2026, as a tab on Candidates) --
// kept as a redirect so bookmarks/links still land somewhere useful.
export default function ReferralsRedirectPage() {
  redirect("/candidates/referrals");
}
