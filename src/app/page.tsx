import { redirect } from "next/navigation";

// ROS Phase 2: Priority Actions is now the true home screen -- the brief's
// recruiter-first workflow starts at "what should I do next", not the
// candidates list. Freelancer/vendor accounts never reach this route (the
// middleware already redirects them straight to /vendor/mandates), so this
// only needs to cover staff.
export default function Home() {
  redirect("/inbox");
}
