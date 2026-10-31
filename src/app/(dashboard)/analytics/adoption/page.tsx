import { redirect } from "next/navigation";

// Adoption was removed: with two staff accounts it said nothing the Scoreboard does not.
export default function Page() {
  redirect("/analytics/scoreboard");
}
