import { redirect } from "next/navigation";

// FY targets now live in the Revenue tab.
export default function Page() {
  redirect("/analytics/revenue?view=targets");
}
