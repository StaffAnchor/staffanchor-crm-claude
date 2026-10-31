import { redirect } from "next/navigation";

// The old Inbox (priority actions) was folded into Today. Old links land there.
export default function Page() {
  redirect("/today");
}
