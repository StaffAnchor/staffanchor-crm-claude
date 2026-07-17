import { createClient } from "@/lib/supabase/server";
import InboxView, { type InboxItem } from "./inbox-view";

// Server component: fetches the whole team's open Priority Actions via the
// get_my_inbox() RPC (every staff member sees every task; the UI filters by
// recruiter/assignee client-side) and hands the data to the client-rendered
// inbox UI. Also fetches the recruiter/admin roster once here (same shape
// as MandateStaffingControl's allProfiles fetch on the mandate page) so the
// per-item "assign to" dropdown doesn't need its own round-trip. No writes
// happen here.
export default async function InboxPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_inbox");
  const { data: recruiters } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["admin", "recruiter"])
    .order("full_name");

  const items: InboxItem[] = (error ? [] : data ?? []) as InboxItem[];

  return <InboxView initialItems={items} fetchError={error?.message ?? null} recruiters={recruiters ?? []} />;
}
