import { redirect } from "next/navigation";

// Sales moved under /client-acquisition/sales (Sep 2026, consolidated with
// Employer Inquiries) -- kept as a redirect so bookmarks/links still land
// somewhere useful.
export default function SalesRedirectPage() {
  redirect("/client-acquisition/sales");
}
