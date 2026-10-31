import { redirect } from "next/navigation";

// CV files moved into Analytics, System health.
export default function Page() {
  redirect("/analytics/system?view=files");
}
