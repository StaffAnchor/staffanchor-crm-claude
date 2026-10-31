import { redirect } from "next/navigation";

// The hiring board duplicated each role's own Matches tab and was removed. Old links land on Roles.
export default function Page() {
  redirect("/mandates");
}
