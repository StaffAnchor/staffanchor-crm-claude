import { createClient } from "@/lib/supabase/server";
import InboxView, { type InboxItem } from "@/app/(dashboard)/inbox/inbox-view";

// Reuses the exact same get_my_inbox() RPC and InboxView component as the
// internal dashboard -- RLS + the RPC's own WHERE clause already restrict a
// freelancer caller to only recruiter_id = auth.uid() rows (vs. the
// full-team view staff get), so no separate vendor-only inbox logic is
// needed here.
export default async function VendorInboxPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_inbox");

  const items: InboxItem[] = (error ? [] : data ?? []) as InboxItem[];

  // Vendors/freelancers don't get the recruiter-assignment control -- RLS
  // only lets them update rows already assigned to themselves anyway, so an
  // empty roster here just means the dropdown quietly shows "Unassigned"
  // with no reassignment options rather than exposing the full staff list.
  return <InboxView initialItems={items} fetchError={error?.message ?? null} recruiters={[]} />;
}
