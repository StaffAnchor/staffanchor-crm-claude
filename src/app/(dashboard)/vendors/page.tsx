import { redirect } from "next/navigation";

// Vendors now live inside Team.
export default function Page() {
  redirect("/team?view=vendors");
}
