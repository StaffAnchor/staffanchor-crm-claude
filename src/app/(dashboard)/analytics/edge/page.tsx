import { redirect } from "next/navigation";

// StaffAnchor Edge now lives in the Edge and resume tab.
export default function Page() {
  redirect("/analytics/edge-resume");
}
