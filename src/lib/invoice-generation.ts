import { createClient } from "@/lib/supabase/server";

// Shared resolution logic between the preview route (renders a PDF for
// review, mints nothing) and the generate route (renders + persists +
// advances the tranche) -- so "what you previewed" and "what got generated"
// can never drift apart. Every field can be overridden by the admin in the
// preview/confirm modal (missing DOJ, a location typo, a corrected billing
// amount, or picking a different GST registration when a mandate's city
// doesn't cleanly match one) before the document is actually minted.

export type InvoiceOverrides = {
  candidateName?: string;
  designation?: string;
  location?: string;
  dateOfJoining?: string | null;
  billingAmount?: number;
  registrationId?: string;
  description?: string;
  commissionPct?: number;
  annualCtc?: number;
};

export type ResolvedGstRegistration = {
  id: string;
  label: string;
  gstin: string;
  state_code: string;
  state_name: string | null;
  billing_address: string | null;
  is_default: boolean;
};

export type InvoiceItem = {
  candidateName: string;
  designation: string;
  location: string | null;
  dateOfJoining: string | null;
  billingAmount: number;
  description: string | null;
  commissionPct: number | null;
  annualCtc: number | null;
};

export type ResolveResult =
  // `client`/`item`/`registrations` are attached even on failure whenever
  // they were resolvable (e.g. missing GST registration, missing billing
  // amount) -- so the preview modal can still populate and let the admin
  // edit every other field instead of the form staying permanently blank
  // just because one specific thing is missing.
  | {
      ok: false;
      error: string;
      status: number;
      client?: { id: string; name: string; fee_percentage?: number | string | null };
      item?: InvoiceItem;
      registrations?: ResolvedGstRegistration[];
    }
  | {
      ok: true;
      client: { id: string; name: string; fee_percentage?: number | string | null };
      registrations: ResolvedGstRegistration[];
      registration: ResolvedGstRegistration;
      item: InvoiceItem;
    };

export async function resolveTrancheInvoiceData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trancheId: string,
  overrides: InvoiceOverrides = {}
): Promise<ResolveResult> {
  const { data: tranche, error: trancheError } = await supabase
    .from("placement_fee_tranches")
    .select(
      "id, label, amount_lakhs, split_pct, mandate_id, link_id, mandates(role_title, client_name, city, client_id), candidate_mandate_links(candidates(full_name), date_of_joining, offered_fixed_ctc)"
    )
    .eq("id", trancheId)
    .single();

  if (trancheError || !tranche) {
    return { ok: false, error: trancheError?.message ?? "Tranche not found", status: 404 };
  }

  const mandate = tranche.mandates as unknown as { role_title: string; client_name: string; city: string | null; client_id: string | null } | null;
  const link = tranche.candidate_mandate_links as unknown as { candidates: { full_name: string } | null; date_of_joining: string | null; offered_fixed_ctc: number | string | null } | null;

  if (!mandate?.client_id) {
    return { ok: false, error: "This tranche's mandate has no linked client record -- link it before generating an invoice.", status: 400 };
  }

  const { data: client, error: clientError } = await supabase.from("clients").select("id, name, fee_percentage").eq("id", mandate.client_id).single();
  if (clientError || !client) {
    return { ok: false, error: clientError?.message ?? "Client not found", status: 404 };
  }

  // Item fields are resolvable from the tranche/mandate/link alone --
  // compute them before anything that can block (billing amount, GST
  // registration) so a preview always has candidate name/designation/
  // location/DOJ filled in and editable, even when generation itself
  // can't proceed yet.
  const billingAmountRaw = overrides.billingAmount ?? (tranche.amount_lakhs == null ? null : Number(tranche.amount_lakhs));
  const item: InvoiceItem = {
    candidateName: overrides.candidateName ?? link?.candidates?.full_name ?? "—",
    designation: overrides.designation ?? mandate.role_title,
    location: overrides.location ?? mandate.city,
    dateOfJoining: overrides.dateOfJoining !== undefined ? overrides.dateOfJoining : (link?.date_of_joining ?? null),
    billingAmount: billingAmountRaw ?? 0,
    description: overrides.description?.trim() ? overrides.description.trim() : null,
    // Effective commission on this invoice = client fee % x this tranche's share.
    commissionPct:
      overrides.commissionPct ??
      (client.fee_percentage != null ? Number(client.fee_percentage) * (Number(tranche.split_pct ?? 100) / 100) : null),
    annualCtc: overrides.annualCtc ?? (link?.offered_fixed_ctc != null ? Number(link.offered_fixed_ctc) : null),
  };

  if (billingAmountRaw == null || !Number.isFinite(billingAmountRaw)) {
    return { ok: false, error: "No billing amount set for this tranche -- enter one before generating.", status: 400, client, item };
  }

  const { data: registrations } = await supabase
    .from("client_gst_registrations")
    .select("id, label, gstin, state_code, state_name, billing_address, is_default")
    .eq("client_id", mandate.client_id);

  if (!registrations || registrations.length === 0) {
    return {
      ok: false,
      error: `No GST registration on file for ${client.name}. Add one from the client's page before generating an invoice.`,
      status: 400,
      client,
      item,
      registrations: [],
    };
  }

  const cityLower = (overrides.location ?? mandate.city ?? "").trim().toLowerCase();
  const registration =
    (overrides.registrationId && registrations.find((r) => r.id === overrides.registrationId)) ||
    (cityLower &&
      registrations.find(
        (r) => r.label.toLowerCase().includes(cityLower) || (r.billing_address ?? "").toLowerCase().includes(cityLower)
      )) ||
    registrations.find((r) => r.is_default) ||
    registrations[0];

  return { ok: true, client, registrations, registration, item };
}

// For a Tax Invoice raised against an earlier proforma: the proforma's
// number and date, so the invoice can say "Against Proforma ...".
export async function proformaReference(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trancheId: string
): Promise<{ number: string; date: Date | null } | null> {
  const { data } = await supabase
    .from("placement_fee_tranches")
    .select("proforma_invoice_number, proforma_sent_at")
    .eq("id", trancheId)
    .single();
  if (!data?.proforma_invoice_number) return null;
  return { number: data.proforma_invoice_number, date: data.proforma_sent_at ? new Date(data.proforma_sent_at) : null };
}
