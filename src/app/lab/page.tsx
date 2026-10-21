import { redirect } from "next/navigation";
import { currentLabMember } from "@/lib/lab/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LabEntry() {
  if (await currentLabMember()) redirect("/lab/home");
  return <LoginForm />;
}
