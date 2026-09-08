import { redirect } from "next/navigation";

// Moved under /client-acquisition/employer-inquiries (Sep 2026, consolidated
// with Sales) -- kept as a redirect so bookmarks/links still land somewhere
// useful.
export default function EmployerInquiriesRedirectPage() {
  redirect("/client-acquisition/employer-inquiries");
}
