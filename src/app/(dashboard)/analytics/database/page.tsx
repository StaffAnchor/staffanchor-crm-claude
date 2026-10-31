import { redirect } from "next/navigation";

// The database page was removed: Profile completion shows this, and better.
export default function Page() {
  redirect("/analytics/scoreboard");
}
