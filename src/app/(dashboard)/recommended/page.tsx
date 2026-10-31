import { redirect } from "next/navigation";

// Recommended was removed: no recommendation was ever made. Old links land on Today.
export default function Page() {
  redirect("/today");
}
