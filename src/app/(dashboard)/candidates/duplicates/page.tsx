import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import DuplicatesView, { type Group } from "./duplicates-view";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/candidates");
  const { data } = await supabase.rpc("duplicate_groups");
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      <CandidatesSubNav />
      <h1 className="ros-page-title">Duplicates</h1>
      <p className="mt-1 text-[13px] text-slate-500">
        Profiles that share a mobile number or an email. Choose the one to keep and merge the rest into it: applications, notes, chats, referrals and tasks move across, blanks are filled in, and a copy of the removed profile is saved in the audit log.
      </p>
      <DuplicatesView groups={(data ?? []) as Group[]} />
    </div>
  );
}
