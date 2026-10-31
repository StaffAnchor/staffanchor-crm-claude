import { redirect } from "next/navigation";

// Candidate referrals were removed: none was ever made. Referrals from partners live in Sales Circle.
export default function Page() {
  redirect("/candidates");
}
