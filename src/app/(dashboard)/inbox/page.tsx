import { createClient } from "@/lib/supabase/server";
import InboxView, { type InboxItem } from "./inbox-view";

// Server component: fetches the recruiter's own open Priority Actions via the
// get_my_inbox() RPC (RLS-scoped to auth.uid(), admins see everything) and
// hands the data to the client-rendered inbox UI. No writes happen here.
export default async function InboxPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_inbox");

  const items: InboxItem[] = (error ? [] : data ?? []) as InboxItem[];

  return <InboxView initialItems={items} fetchError={error?.message ?? null} />;
}
