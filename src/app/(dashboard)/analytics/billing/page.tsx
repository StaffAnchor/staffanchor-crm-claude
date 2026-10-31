import { redirect } from "next/navigation";

// Billing now lives in the Revenue tab.
export default function Page() {
  redirect("/analytics/revenue?view=billing");
}
