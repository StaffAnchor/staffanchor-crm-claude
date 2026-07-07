import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientInfoPanel from "./client-info-panel";
import ClientContactsPanel, { type ClientContact } from "./client-contacts-panel";
import ClientPortalAccessPanel from "./client-portal-access-panel";
import ClientMandatesRollup, { type ClientMandateRow } from "./client-mandates-rollup";
import ClientFunnelPanel from "./client-funnel-panel";
import { computeFunnel } from "../funnel-utils";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: clientRow } = await supabase.from("clients").select("*").eq("id", id).single();
  if (!clientRow) notFound();

  const { data: mandates } = await supabase
    .from("mandates")
    .select("id, role_title, status, city")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  const mandateIds = (mandates ?? []).map((m) => m.id);
  const { data: links } = mandateIds.length
    ? await supabase
        .from("candidate_mandate_links")
        .select("mandate_id, in_shortlist, stage")
        .in("mandate_id", mandateIds)
    : { data: [] as { mandate_id: string; in_shortlist: boolean; stage: string | null }[] };

  const linkedByMandate: Record<string, number> = {};
  const shortlistedByMandate: Record<string, number> = {};
  (links ?? []).forEach((l) => {
    linkedByMandate[l.mandate_id] = (linkedByMandate[l.mandate_id] ?? 0) + 1;
    if (l.in_shortlist) shortlistedByMandate[l.mandate_id] = (shortlistedByMandate[l.mandate_id] ?? 0) + 1;
  });

  const funnelStats = computeFunnel((links ?? []).map((l) => l.stage));

  const mandateRows: ClientMandateRow[] = (mandates ?? []).map((m) => ({
    id: m.id,
    role_title: m.role_title,
    status: m.status,
    city: m.city,
    linked: linkedByMandate[m.id] ?? 0,
    shortlisted: shortlistedByMandate[m.id] ?? 0,
  }));

  const { data: contacts } = await supabase
    .from("client_contacts")
    .select("id, full_name, designation, email, phone, is_primary")
    .eq("client_id", id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const { data: invites } = await supabase
    .from("client_invites")
    .select("id, email, created_at, consumed_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  const { data: users } = await supabase
    .from("client_users")
    .select("id, email, full_name, created_at")
    .eq("client_id", id);

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        <div>
          <Link href="/clients" className="text-xs text-slate-500 hover:text-slate-800">
            ← All clients
          </Link>
          <div className="bg-white border border-slate-200 rounded-xl p-6 mt-2 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">{clientRow.name}</h1>
            <p className="text-sm text-slate-500">
              {clientRow.industry ?? "Industry not set"} {clientRow.hq_city ? `· ${clientRow.hq_city}` : ""}
            </p>
          </div>
        </div>

        <ClientMandatesRollup rows={mandateRows} />

        <ClientFunnelPanel stats={funnelStats} />
      </div>

      <div className="space-y-6">
        <ClientInfoPanel
          clientId={id}
          initialIndustry={clientRow.industry}
          initialHqCity={clientRow.hq_city}
          initialWebsite={clientRow.website}
          initialNotes={clientRow.notes}
        />
        <ClientContactsPanel clientId={id} initialContacts={(contacts ?? []) as ClientContact[]} />
        <ClientPortalAccessPanel
          clientId={id}
          clientName={clientRow.name}
          initialInvites={invites ?? []}
          initialUsers={users ?? []}
        />
      </div>
    </div>
  );
}
