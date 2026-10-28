import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientInfoPanel from "./client-info-panel";
import ClientGstPanel, { type GstRegistration } from "./client-gst-panel";
import ClientContactsPanel, { type ClientContact } from "./client-contacts-panel";
import ClientResourcesPanel, { type ClientResource } from "./client-resources-panel";
import ClientPortalAccessPanel from "./client-portal-access-panel";
import ClientMandatesRollup, { type ClientMandateRow } from "./client-mandates-rollup";
import ClientFunnelPanel from "./client-funnel-panel";
import { computeFunnel } from "../funnel-utils";
import { Card } from "@/components/ui/card";
import MandateRequestLinkPanel from "@/components/mandate-request-link-panel";
import { Tabs } from "@/components/ui/tabs";
import ClientHeader from "./client-header";
import { Briefcase, Globe2, Users as UsersIcon, Receipt } from "lucide-react";
import ClientPortalOverview, { type SharedCandidate } from "./client-portal-overview";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: clientRow } = await supabase.from("clients").select("*").eq("id", id).single();
  if (!clientRow) notFound();

  // The list page (clients/page.tsx) already hides other reps' clients from
  // a Partner's view -- but that's only a query filter on the list, not an
  // access boundary. Without this check, a Partner who obtained a client ID
  // any other way (a stale link, guessing a URL) could still view and edit
  // a client that isn't theirs. Enforce the same scoping here, at the
  // actual data-fetch layer.
  const {
    data: { user: viewerUser },
  } = await supabase.auth.getUser();
  const { data: viewerProfile } = viewerUser
    ? await supabase.from("profiles").select("role").eq("id", viewerUser.id).single()
    : { data: null };
  if (viewerProfile?.role === "partner" && clientRow.owner_id !== viewerUser?.id) {
    notFound();
  }

  const { data: mandates } = await supabase
    .from("mandates")
    .select("id, role_title, status, city")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  const mandateIds = (mandates ?? []).map((m) => m.id);
  const { data: links } = mandateIds.length
    ? await supabase
        .from("candidate_mandate_links")
        .select("mandate_id, stage")
        .in("mandate_id", mandateIds)
    : { data: [] as { mandate_id: string; stage: string | null }[] };

  // Derived from `stage`, not the legacy `in_shortlist` flag -- see clients/page.tsx.
  const SHORTLISTED_STAGES = new Set(["client_shortlisted", "offer", "placed"]);
  const linkedByMandate: Record<string, number> = {};
  const shortlistedByMandate: Record<string, number> = {};
  (links ?? []).forEach((l) => {
    linkedByMandate[l.mandate_id] = (linkedByMandate[l.mandate_id] ?? 0) + 1;
    if (l.stage && SHORTLISTED_STAGES.has(l.stage)) {
      shortlistedByMandate[l.mandate_id] = (shortlistedByMandate[l.mandate_id] ?? 0) + 1;
    }
  });

  // What the client sees in their portal: the people marked as shared (in_shortlist) on this client's roles.
  const { data: sharedRows } = mandateIds.length
    ? await supabase
        .from("candidate_mandate_links")
        .select("id, mandate_id, candidate_id, client_feedback, requested_interview_at, confirmed_interview_at, client_decision_at, shortlisted_at, candidates(full_name)")
        .in("mandate_id", mandateIds)
        .eq("in_shortlist", true)
    : { data: [] };
  const shared: SharedCandidate[] = ((sharedRows ?? []) as unknown as { id: string; mandate_id: string; candidate_id: string; client_feedback: string | null; requested_interview_at: string | null; confirmed_interview_at: string | null; client_decision_at: string | null; shortlisted_at: string | null; candidates: { full_name: string } | null }[]).map((r) => ({
    linkId: r.id,
    mandateId: r.mandate_id,
    candidateId: r.candidate_id,
    name: r.candidates?.full_name ?? "Unnamed",
    feedback: r.client_feedback,
    interviewRequested: !!r.requested_interview_at,
    interviewConfirmed: !!r.confirmed_interview_at,
    decidedAt: r.client_decision_at,
  }));

  const headerShared = ((sharedRows ?? []) as unknown as { mandate_id: string; client_feedback: string | null; shortlisted_at: string | null; client_decision_at: string | null; requested_interview_at: string | null; confirmed_interview_at: string | null }[]).map((r) => ({
    mandateId: r.mandate_id,
    feedback: r.client_feedback,
    sharedAt: r.shortlisted_at,
    decidedAt: r.client_decision_at,
    interviewRequested: !!r.requested_interview_at,
    interviewConfirmed: !!r.confirmed_interview_at,
  }));
  const { data: invoiceRows } = await supabase.from("historical_invoices").select("invoice_date, net_amount, gross_amount, currency").eq("client_id", id);

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

  const { data: resources } = await supabase
    .from("client_resources")
    .select("id, kind, name, url, storage_path, content_type")
    .eq("client_id", id)
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

  // Owner (Partner) assignment options -- any staff can be picked, since a
  // client might be reassigned from an admin-created entry to a partner.
  const { data: staffProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name");
  const ownerOptions = (staffProfiles ?? []).map((p) => ({
    id: p.id,
    label: p.full_name ?? p.email ?? "Unknown",
  }));

  const { data: gstRegistrations } = await supabase
    .from("client_gst_registrations")
    .select("id, label, gstin, state_code, state_name, billing_address, contact_phone, billing_email, is_default")
    .eq("client_id", id)
    .order("is_default", { ascending: false })
    .order("label");

  return (
    <div className="max-w-[1180px] mx-auto px-5 py-8">
      <Link href="/clients" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors duration-200 ease-ros">
        ← All clients
      </Link>
      <Card className="mt-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] leading-8 font-semibold tracking-tight text-slate-900 dark:text-slate-100">{clientRow.name}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {clientRow.industry ?? "Industry not set"} {clientRow.hq_city ? `· ${clientRow.hq_city}` : ""}
              {(contacts ?? [])[0] ? ` · ${(contacts ?? [])[0].full_name}${(contacts ?? [])[0].designation ? `, ${(contacts ?? [])[0].designation}` : ""}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/clients/activity?client=${encodeURIComponent(id)}`}
            className="rounded-ros-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-[13px] font-semibold px-4 py-2 transition-colors"
          >
            Portal activity
          </Link>
          <Link
            href={`/mandates?newClientId=${encodeURIComponent(id)}&newClientName=${encodeURIComponent(clientRow.name)}#new-mandate`}
            className="shrink-0 rounded-ros-md bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-semibold px-4 py-2 transition-colors"
          >
            + Create a role
          </Link>
          </div>
        </div>
      </Card>

      <ClientHeader
        roles={(mandates ?? []).map((m) => ({ id: m.id, status: m.status, title: m.role_title }))}
        shared={headerShared}
        stages={(links ?? []).map((l) => l.stage)}
        invoices={((invoiceRows ?? []) as { invoice_date: string | null; net_amount: number | null; gross_amount: number | null; currency: string | null }[]).map((i) => ({ invoiceDate: i.invoice_date, net: i.net_amount, gross: i.gross_amount, currency: i.currency }))}
        contact={(contacts ?? [])[0] ? { name: (contacts ?? [])[0].full_name, designation: (contacts ?? [])[0].designation, email: (contacts ?? [])[0].email, phone: (contacts ?? [])[0].phone } : null}
        feePercentage={clientRow.fee_percentage}
      />

      <Tabs
        className="mt-5"
        items={[
          {
            key: "roles",
            label: "Roles",
            icon: <Briefcase className="h-3.5 w-3.5" />,
            badge: <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-200">{mandateRows.length}</span>,
            content: (
              <>
                <ClientMandatesRollup rows={mandateRows} />
                <ClientFunnelPanel stats={funnelStats} />
              </>
            ),
          },
          {
            key: "portal",
            label: "Client portal",
            icon: <Globe2 className="h-3.5 w-3.5" />,
            content: (
              <>
                <ClientPortalOverview
                  clientId={id}
                  clientName={clientRow.name}
                  roles={(mandates ?? []).map((m) => ({ id: m.id, title: m.role_title, status: m.status, city: m.city }))}
                  shared={shared}
                />
                <ClientPortalAccessPanel clientId={id} clientName={clientRow.name} initialInvites={invites ?? []} initialUsers={users ?? []} />
                <MandateRequestLinkPanel clientNamePrefill={clientRow.name} />
              </>
            ),
          },
          {
            key: "contacts",
            label: "Contacts and files",
            icon: <UsersIcon className="h-3.5 w-3.5" />,
            content: (
              <>
                <ClientContactsPanel clientId={id} initialContacts={(contacts ?? []) as ClientContact[]} />
                <ClientResourcesPanel clientId={id} initial={(resources ?? []) as ClientResource[]} />
              </>
            ),
          },
          {
            key: "billing",
            label: "Billing and terms",
            icon: <Receipt className="h-3.5 w-3.5" />,
            content: (
              <>
                <ClientInfoPanel
                  clientId={id}
                  initialIndustry={clientRow.industry}
                  initialHqCity={clientRow.hq_city}
                  initialWebsite={clientRow.website}
                  initialNotes={clientRow.notes}
                  initialOwnerId={clientRow.owner_id}
                  initialFeePercentage={clientRow.fee_percentage}
                  ownerOptions={ownerOptions}
                />
                <ClientGstPanel clientId={id} initial={(gstRegistrations ?? []) as GstRegistration[]} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
