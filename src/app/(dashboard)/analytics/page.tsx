import { redirect } from "next/navigation";

// Bare /analytics has nothing of its own to show -- Reports is the default
// sub-tab (same landing spot as the old standalone Reports nav item).
export default function AnalyticsIndexPage() {
  redirect("/analytics/reports");
}
