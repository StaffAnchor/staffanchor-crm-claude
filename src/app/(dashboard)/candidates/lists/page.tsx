import { redirect } from "next/navigation";

// Saved shortlists were removed: none was ever saved. Old links land on Talent.
export default function Page() {
  redirect("/candidates");
}
