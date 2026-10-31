import { redirect } from "next/navigation";

// Flow and AI now lives in the System health tab.
export default function Page() {
  redirect("/analytics/system");
}
