import { redirect } from "next/navigation";

// Resume orders now live in the Edge and resume tab.
export default function Page() {
  redirect("/analytics/edge-resume?view=resume");
}
