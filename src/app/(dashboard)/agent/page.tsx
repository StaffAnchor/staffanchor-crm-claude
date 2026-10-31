import { redirect } from "next/navigation";

// The CRM assistant was removed (one message was ever sent). Old links land on Today.
export default function Page() {
  redirect("/today");
}
