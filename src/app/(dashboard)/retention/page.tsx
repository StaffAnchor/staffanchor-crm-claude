import { redirect } from "next/navigation";

// Retention check-ins now live inside Placements (each row expands to show
// its 30/90/180-day follow-ups) instead of this separate page -- see
// (dashboard)/placements/. Kept as a redirect rather than deleting the
// route outright so any existing bookmark or link to /retention still
// lands somewhere useful.
export default function RetentionPage() {
  redirect("/placements");
}
