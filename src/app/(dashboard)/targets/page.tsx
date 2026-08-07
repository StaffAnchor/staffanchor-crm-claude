import { createClient } from "@/lib/supabase/server";
import TargetsView, { type TargetAccountRow } from "./targets-view";

// BD pipeline for the GCC/BFSI tier-2-city ICP list from the business plan
// -- previously a prospect had nowhere to live in the system until they
// actually signed as a client. This is deliberately separate from `clients`
// (which stays "people who've actually signed"); converting a target here
// creates the real clients row and links back via converted_client_id.
export default async function TargetsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("target_accounts")
    .select("*, profiles(full_name, email)")
    .order("last_activity_at", { ascending: false });

  const { data: staffProfiles } = await supabase.from("profiles").select("id, full_name, email").order("full_name");

  const rows: TargetAccountRow[] = (error ? [] : data ?? []).map((r) => ({
    id: r.id,
    company_name: r.company_name,
    industry: r.industry,
    account_type: r.account_type,
    city: r.city,
    priority: r.priority,
    status: r.status,
    contact_name: r.contact_name,
    contact_email: r.contact_email,
    contact_phone: r.contact_phone,
    notes: r.notes,
    owner_id: r.owner_id,
    owner_name: (r.profiles as unknown as { full_name: string | null; email: string } | null)?.full_name ?? null,
    converted_client_id: r.converted_client_id,
    created_at: r.created_at,
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Target accounts</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        BD pipeline for prospect companies (GCC / BFSI / SaaS in tier-2 cities) -- track courtship before they become
        a real client.
      </p>
      <TargetsView
        initialRows={rows}
        fetchError={error?.message ?? null}
        staffOptions={(staffProfiles ?? []).map((p) => ({ id: p.id, label: p.full_name ?? p.email ?? "Unknown" }))}
      />
    </div>
  );
}
