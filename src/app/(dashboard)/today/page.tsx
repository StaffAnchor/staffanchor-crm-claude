import { redirect } from "next/navigation";

// Today became Home. The long list it used to show is still at /home/everything, reached from the boxes on Home.
export default function Page() {
  redirect("/home");
}
