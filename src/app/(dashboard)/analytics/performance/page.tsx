import { redirect } from "next/navigation";

// Performance is the Revenue tab's overview.
export default function Page() {
  redirect("/analytics/revenue");
}
