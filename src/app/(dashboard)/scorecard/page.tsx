import { redirect } from "next/navigation";

// The scorecard moved into Analytics, System health.
export default function Page() {
  redirect("/analytics/system?view=quality");
}
