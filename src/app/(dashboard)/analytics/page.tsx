import { redirect } from "next/navigation";

// Bare /analytics has nothing of its own to show -- The Scoreboard is the default
// sub-tab: the few numbers that say whether the business is working.
export default function AnalyticsIndexPage() {
  redirect("/analytics/scoreboard");
}
