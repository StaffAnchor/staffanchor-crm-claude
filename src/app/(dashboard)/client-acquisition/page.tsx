import { redirect } from "next/navigation";

// Bare /client-acquisition has nothing of its own to show -- land on Sales,
// the more actively-worked of the two sub-sections.
export default function ClientAcquisitionPage() {
  redirect("/client-acquisition/sales");
}
