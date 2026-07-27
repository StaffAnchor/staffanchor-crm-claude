"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, Building2, Briefcase, ArrowRight, Trash2, ChevronDown, ChevronUp, Users2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export type InquiryStatus = "new" | "contacted" | "converted" | "dismissed";
export type InquirySource = "employers_page" | "contact_page" | "client_mandate_request";

export interface EmployerInquiryRow {
  id: string;
  created_at: string;
  company_name: string | null;
  industry: string | null;
  custom_industry: string | null;
  full_name: string;
  designation: string | null;
  work_email: string;
  mobile_number: string | null;
  audience: string | null;
  message: string | null;
  role_title: string | null;
  category: string | null;
  city: string | null;
  budget_min: number | null;
  budget_max: number | null;
  source: InquirySource;
  status: InquiryStatus;
  notes: string | null;
  converted_client_id: string | null;
  converted_mandate_id: string | null;
  converted_lead_id: string | null;
  // Deeper brief fields -- present when the client filled these in
  // themselves via the shared mandate-request link, or when a recruiter
  // fills them in manually before promoting to a real mandate.
  sub_domains: string[] | null;
  cities: string[] | null;
  experience_min: number | null;
  experience_max: number | null;
  hiring_reason: string | null;
  team_handling: string | null;
  team_size_band: string | null;
  work_mode: string | null;
  working_days: string | null;
  shift_timing: string | null;
  reporting_manager_title: string | null;
  company_size_band: string | null;
  company_highlight_links: string[] | null;
  sales_cycle: string | null;
  deal_size_currency: string | null;
  deal_size_band: string | null;
  customer_profile: string | null;
  expectation_3_month: string | null;
  expectation_6_month: string | null;
  expectation_1_year: string | null;
  selling_style: string | null;
  preferred_industries: string[] | null;
  industries_sold_to: string[] | null;
  languages_required: string[] | null;
  week_off: string[] | null;
  week_off_type: string | null;
  rotational_offs_per_week: number | null;
  mandatory_working_days: string[] | null;
  b2c_customer_types: string[] | null;
  client_profile: string[] | null;
  // Set only when this brief was submitted by a client who already has
  // Client Portal access (self-service, no shareable link needed) --
  // lets Create Mandate auto-link the new mandate to their existing
  // client record instead of leaving mandates.client_id unset.
  existing_client_id: string | null;
  owner_id: string | null;
}

export type TeamMember = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  specialties: string[] | null;
};

const SOURCE_LABEL: Partial<Record<InquirySource, string>> = {
  employers_page: "Employer form",
  client_mandate_request: "Client brief",
};

const STATUS_TONE: Record<InquiryStatus, BadgeTone> = {
  new: "info",
  contacted: "warning",
  converted: "success",
  dismissed: "neutral",
};

const STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  dismissed: "Dismissed",
};

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales / Other",
};

const FILTERS: { key: InquiryStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "converted", label: "Converted" },
  { key: "dismissed", label: "Dismissed" },
];

export default function EmployerInquiriesView({
  initialRows,
  teamMembers,
}: {
  initialRows: EmployerInquiryRow[];
  teamMembers: TeamMember[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initialRows);
  const [activeFilter, setActiveFilter] = useState<InquiryStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which row an error belongs to, so it renders under that specific card
  // instead of one generic banner at the top the user has to guess about --
  // null means the error isn't tied to a row (e.g. a bulk-delete failure).
  const [errorRowId, setErrorRowId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  // Cards show a truncated preview by default (company/role summary +
  // 2-line message clamp); expanding shows the full message and every
  // deeper-brief field the client filled in, since a lot of that was
  // previously only reachable by truncated summary lines with no way to
  // see the untruncated values.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // Bulk-select for spam cleanup -- most spam here is bot-submitted garbage
  // (garbled names, dotted-gmail-trick emails, random digit "phone numbers")
  // that a recruiter wants gone permanently, not just relabeled "Dismissed"
  // while still cluttering the list. This is a hard delete, not a status
  // change -- there is deliberately no undo, since these rows have zero
  // legitimate value once identified as spam.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // For a given inquiry's category, show the specialists first (matching
  // team member specialties), then everyone else -- so the recruiter doesn't
  // have to hunt through the whole team list to find the right person.
  function teamOptionsFor(category: string | null) {
    const specialists = teamMembers.filter((m) => category && m.specialties?.includes(category));
    const specialistIds = new Set(specialists.map((m) => m.id));
    const others = teamMembers.filter((m) => !specialistIds.has(m.id));
    return { specialists, others };
  }

  async function assignOwner(inquiryId: string, ownerId: string) {
    if (!ownerId) return;
    setAssigningId(inquiryId);
    setError(null);
    const { error: err } = await supabase.rpc("assign_inquiry_owner", {
      p_inquiry_id: inquiryId,
      p_owner_id: ownerId,
    });
    setAssigningId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((cur) => cur.map((r) => (r.id === inquiryId ? { ...r, owner_id: ownerId } : r)));
  }

  const filtered = useMemo(
    () => (activeFilter === "all" ? rows : rows.filter((r) => r.status === activeFilter)),
    [rows, activeFilter]
  );

  async function setStatus(id: string, status: InquiryStatus) {
    const prev = rows;
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, status } : r)));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("employer_inquiries")
      .update({ status, reviewed_by: user?.id ?? null })
      .eq("id", id);
    if (updateError) {
      setRows(prev);
      setError(updateError.message);
    }
  }

  // Recruiter-gated publish step, part 1: a mandate submitted via a public
  // form lands here, not in public.mandates directly. Clicking this creates
  // the mandate record but as status "draft" -- NOT "open" -- so it still
  // can never appear live on jobs.staffanchor.com yet. It only shows up on
  // the internal Mandates page, where a recruiter reviews/edits it (existing
  // edit controls) and then explicitly clicks "Publish mandate" there (part
  // 2, in basic-details-panel.tsx) to flip it to "open" and make it public.
  async function createMandate(row: EmployerInquiryRow) {
    if (row.converted_mandate_id) {
      router.push(`/mandates/${row.converted_mandate_id}`);
      return;
    }
    if (!row.company_name || !row.role_title) return;
    setBusyId(row.id);
    setError(null);
    setErrorRowId(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const contactLines = [
        `Contact: ${row.full_name}${row.designation ? ` (${row.designation})` : ""}`,
        `Email: ${row.work_email}`,
        row.mobile_number ? `Mobile: ${row.mobile_number}` : null,
        "",
        row.message ?? "",
      ]
        .filter((l) => l !== null)
        .join("\n");

      // cities/sub_domains can come back as an empty array (not null) when
      // the client left the field blank, so `?? []` alone doesn't fall back
      // to the singular `city` column -- check length explicitly.
      const cities = row.cities?.length ? row.cities : row.city ? [row.city] : [];
      const subDomains = row.sub_domains ?? [];

      const { data: mandate, error: mandateError } = await supabase
        .from("mandates")
        .insert({
          client_id: row.existing_client_id,
          client_name: row.company_name,
          role_title: row.role_title,
          category: row.category,
          sub_domains: subDomains,
          sub_domain: subDomains.join(", ") || null,
          cities,
          city: cities[0] ?? null,
          budget_min: row.budget_min,
          budget_max: row.budget_max,
          experience_min: row.experience_min,
          experience_max: row.experience_max,
          hiring_reason: row.hiring_reason,
          team_handling: row.team_handling,
          team_size_band: row.team_size_band,
          work_mode: row.work_mode,
          working_days: row.working_days,
          shift_timing: row.shift_timing,
          reporting_manager_title: row.reporting_manager_title,
          company_size_band: row.company_size_band,
          company_highlight_links: row.company_highlight_links ?? [],
          sales_cycle: row.sales_cycle,
          deal_size_currency: row.deal_size_currency,
          deal_size_band: row.deal_size_band,
          customer_profile: row.customer_profile,
          expectation_3_month: row.expectation_3_month,
          expectation_6_month: row.expectation_6_month,
          expectation_1_year: row.expectation_1_year,
          selling_style: row.selling_style,
          preferred_industries: row.preferred_industries ?? [],
          industries_sold_to: row.industries_sold_to ?? [],
          languages_required: row.languages_required ?? [],
          week_off: row.week_off ?? [],
          week_off_type: row.week_off_type,
          rotational_offs_per_week: row.rotational_offs_per_week,
          mandatory_working_days: row.mandatory_working_days ?? [],
          b2c_customer_types: row.b2c_customer_types ?? [],
          client_profile: row.client_profile ?? [],
          notes: contactLines,
          status: "draft",
        })
        .select("id")
        .single();
      if (mandateError || !mandate) throw mandateError ?? new Error("Failed to create mandate");

      // Carry the inquiry's assigned owner (if any) over as mandate staffing,
      // so ownership doesn't get lost the moment it's promoted to a mandate.
      if (row.owner_id) {
        await supabase.rpc("assign_mandate_staff", { p_mandate_id: mandate.id, p_freelancer_id: row.owner_id });
      }

      const { error: inquiryError } = await supabase
        .from("employer_inquiries")
        .update({ status: "converted", converted_mandate_id: mandate.id, reviewed_by: user?.id ?? null })
        .eq("id", row.id);
      if (inquiryError) throw inquiryError;

      setRows((cur) =>
        cur.map((r) => (r.id === row.id ? { ...r, status: "converted", converted_mandate_id: mandate.id } : r))
      );
      router.push(`/mandates/${mandate.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mandate");
      setErrorRowId(row.id);
    } finally {
      setBusyId(null);
    }
  }

  async function convertToClient(row: EmployerInquiryRow) {
    if (row.converted_client_id) {
      router.push(`/clients/${row.converted_client_id}`);
      return;
    }
    if (!row.company_name) return; // Contact Us submissions carry no company name -- nothing to convert.
    setBusyId(row.id);
    setError(null);
    setErrorRowId(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          name: row.company_name,
          industry: row.industry === "Other" ? row.custom_industry : row.industry,
        })
        .select("id")
        .single();
      if (clientError || !client) throw clientError ?? new Error("Failed to create client");

      const { error: contactError } = await supabase.from("client_contacts").insert({
        client_id: client.id,
        full_name: row.full_name,
        designation: row.designation,
        email: row.work_email,
        phone: row.mobile_number,
        is_primary: true,
      });
      if (contactError) throw contactError;

      const { error: inquiryError } = await supabase
        .from("employer_inquiries")
        .update({ status: "converted", converted_client_id: client.id, reviewed_by: user?.id ?? null })
        .eq("id", row.id);
      if (inquiryError) throw inquiryError;

      setRows((cur) =>
        cur.map((r) => (r.id === row.id ? { ...r, status: "converted", converted_client_id: client.id } : r))
      );
      router.push(`/clients/${client.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert to client");
      setErrorRowId(row.id);
    } finally {
      setBusyId(null);
    }
  }

  // Alternate conversion path: for an inquiry that isn't ready to become a
  // real mandate yet (or is a B2B/B2C prospect rather than a hiring
  // request), send it into the Sales pipeline instead so it isn't lost.
  // Source is always "website" -- these came from staffanchor.com forms,
  // not manual entry or a paid sourcing tool.
  async function convertToSalesLead(row: EmployerInquiryRow) {
    if (row.converted_lead_id) {
      router.push(`/sales/${row.converted_lead_id}`);
      return;
    }
    if (!row.company_name) return;
    setBusyId(row.id);
    setError(null);
    setErrorRowId(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const noteLines = [row.message ?? "", row.role_title ? `\nRole of interest: ${row.role_title}` : null]
        .filter((l) => l)
        .join("\n");

      const { data: lead, error: leadError } = await supabase
        .from("sales_leads")
        .insert({
          company_name: row.company_name,
          company_industry: row.industry === "Other" ? row.custom_industry : row.industry,
          contact_name: row.full_name,
          contact_title: row.designation,
          contact_email: row.work_email,
          contact_phone: row.mobile_number,
          source: "website",
          notes: noteLines || null,
        })
        .select("id")
        .single();
      if (leadError || !lead) throw leadError ?? new Error("Failed to create sales lead");

      if (row.owner_id) {
        await supabase.from("sales_leads").update({ owner_id: row.owner_id }).eq("id", lead.id);
      }

      const { error: inquiryError } = await supabase
        .from("employer_inquiries")
        .update({ status: "converted", converted_lead_id: lead.id, reviewed_by: user?.id ?? null })
        .eq("id", row.id);
      if (inquiryError) throw inquiryError;

      setRows((cur) =>
        cur.map((r) => (r.id === row.id ? { ...r, status: "converted", converted_lead_id: lead.id } : r))
      );
      router.push(`/sales/${lead.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sales lead");
      setErrorRowId(row.id);
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelected((cur) => {
      const allSelected = filtered.length > 0 && filtered.every((r) => cur.has(r.id));
      if (allSelected) return new Set();
      return new Set(filtered.map((r) => r.id));
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (!window.confirm(`Permanently delete ${ids.length} inquir${ids.length === 1 ? "y" : "ies"}? This can't be undone.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await supabase.from("employer_inquiries").delete().in("id", ids);
    setDeleting(false);
    if (deleteError) {
      setError(deleteError.message);
      setErrorRowId(null);
      return;
    }
    setRows((cur) => cur.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 rounded-ros-md border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2">
          <p className="text-[12.5px] font-medium text-rose-700 dark:text-rose-300">
            {selected.size} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-[12px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Clear
            </button>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-ros-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-colors duration-200 ease-ros"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-3">
        <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400 mr-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
            onChange={toggleSelectAllFiltered}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Select all
        </label>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-ros-full border transition-colors duration-200 ease-ros ${
              activeFilter === f.key
                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            {f.label}
            {f.key !== "all" && ` (${rows.filter((r) => r.status === f.key).length})`}
          </button>
        ))}
      </div>

      {error && !errorRowId && (
        <p className="text-[12px] text-rose-600 dark:text-rose-400 mb-3">{error}</p>
      )}

      <div className="space-y-2.5">
        {filtered.map((row) => {
          const isMandate = (row.source === "employers_page" || row.source === "client_mandate_request") && !!row.role_title;
          return (
            <Card key={row.id} padded={false} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    className="mt-1 rounded border-slate-300 dark:border-slate-600 shrink-0"
                  />
                  <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {row.company_name ?? row.full_name}
                    </p>
                    <Badge tone={STATUS_TONE[row.status]} size="sm">
                      {STATUS_LABEL[row.status]}
                    </Badge>
                    {isMandate ? (
                      <Badge tone="accent" size="sm" icon={<Briefcase className="w-2.5 h-2.5" />}>
                        Mandate
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">Contact</Badge>
                    )}
                    {SOURCE_LABEL[row.source] && (
                      <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                        {SOURCE_LABEL[row.source]}
                      </Badge>
                    )}
                    {row.existing_client_id && (
                      <Badge tone="success" size="sm" className="normal-case tracking-normal">
                        Existing client
                      </Badge>
                    )}
                    {row.audience && (
                      <Badge tone="info" size="sm" className="normal-case tracking-normal">
                        {row.audience}
                      </Badge>
                    )}
                    {(row.industry || row.custom_industry) && (
                      <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                        {row.industry === "Other" ? row.custom_industry : row.industry}
                      </Badge>
                    )}
                    <button
                      onClick={() => toggleExpanded(row.id)}
                      className="ml-auto flex items-center gap-0.5 text-[11px] font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200 ease-ros shrink-0"
                    >
                      {expandedIds.has(row.id) ? (
                        <>
                          Less <ChevronUp className="w-3 h-3" />
                        </>
                      ) : (
                        <>
                          Full details <ChevronDown className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </div>

                  {isMandate && (
                    <>
                      <p className="text-[12.5px] text-slate-700 dark:text-slate-300 font-medium">
                        {row.role_title}
                        {row.category && (
                          <span className="text-slate-400 dark:text-slate-500 font-normal">
                            {" "}
                            · {CATEGORY_LABEL[row.category] ?? row.category}
                          </span>
                        )}
                        {(row.cities?.length ? row.cities.join(", ") : row.city) && (
                          <span className="text-slate-400 dark:text-slate-500 font-normal">
                            {" "}
                            · {row.cities?.length ? row.cities.join(", ") : row.city}
                          </span>
                        )}
                        {(row.budget_min !== null || row.budget_max !== null) && (
                          <span className="text-slate-400 dark:text-slate-500 font-normal">
                            {" "}
                            · ₹{row.budget_min ?? "0"}-{row.budget_max ?? "+"}L
                          </span>
                        )}
                      </p>
                      {(row.sub_domains?.length ||
                        row.sales_cycle ||
                        row.deal_size_band ||
                        row.work_mode ||
                        row.selling_style ||
                        row.languages_required?.length ||
                        row.preferred_industries?.length) && (
                        <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {[
                            row.sub_domains?.length ? row.sub_domains.join(", ") : null,
                            row.sales_cycle ? `${row.sales_cycle} cycle` : null,
                            row.deal_size_band ? `${row.deal_size_currency ?? ""} ${row.deal_size_band} deals`.trim() : null,
                            row.work_mode,
                            row.selling_style ? `${row.selling_style} seller` : null,
                            row.preferred_industries?.length ? `Background: ${row.preferred_industries.join(", ")}` : null,
                            row.industries_sold_to?.length ? `Sells to: ${row.industries_sold_to.join(", ")}` : null,
                            row.languages_required?.length ? `Languages: ${row.languages_required.join(", ")}` : null,
                            row.week_off_type === "fixed" && row.week_off?.length ? `Off: ${row.week_off.join(", ")}` : null,
                            row.week_off_type === "rotational" && row.rotational_offs_per_week
                              ? `${row.rotational_offs_per_week} rotational off${row.rotational_offs_per_week > 1 ? "s" : ""}/week${
                                  row.mandatory_working_days?.length ? ` (${row.mandatory_working_days.join(", ")} mandatory)` : ""
                                }`
                              : null,
                            row.b2c_customer_types?.length ? `Consumers: ${row.b2c_customer_types.join(", ")}` : null,
                            row.client_profile?.length ? `Talks to: ${row.client_profile.join(", ")}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </>
                  )}

                  {row.company_name && (
                    <p className="text-[12.5px] text-slate-600 dark:text-slate-400">
                      {row.full_name}
                      {row.designation && <span className="text-slate-400 dark:text-slate-500"> · {row.designation}</span>}
                    </p>
                  )}
                  {row.message && (
                    <p
                      className={`text-[12.5px] text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-line ${
                        expandedIds.has(row.id) ? "" : "line-clamp-2"
                      }`}
                    >
                      {row.message}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {row.work_email}
                    </span>
                    {row.mobile_number && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {row.mobile_number}
                      </span>
                    )}
                    <span>{new Date(row.created_at).toLocaleDateString()}</span>
                  </div>

                  {expandedIds.has(row.id) && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
                      {[
                        ["Category", row.category ? CATEGORY_LABEL[row.category] ?? row.category : null],
                        ["Sub-domains", row.sub_domains?.length ? row.sub_domains.join(", ") : null],
                        ["Cities", row.cities?.length ? row.cities.join(", ") : row.city],
                        ["Budget", row.budget_min !== null || row.budget_max !== null ? `₹${row.budget_min ?? "0"}-${row.budget_max ?? "+"}L` : null],
                        ["Experience", row.experience_min !== null || row.experience_max !== null ? `${row.experience_min ?? "0"}-${row.experience_max ?? "+"} yrs` : null],
                        ["Hiring reason", row.hiring_reason],
                        ["Team handling", row.team_handling],
                        ["Team size", row.team_size_band],
                        ["Work mode", row.work_mode],
                        ["Working days", row.working_days],
                        ["Shift timing", row.shift_timing],
                        ["Reports to", row.reporting_manager_title],
                        ["Company size", row.company_size_band],
                        ["Sales cycle", row.sales_cycle],
                        ["Deal size", row.deal_size_band ? `${row.deal_size_currency ?? ""} ${row.deal_size_band}`.trim() : null],
                        ["Customer profile", row.customer_profile],
                        ["3-month expectation", row.expectation_3_month],
                        ["6-month expectation", row.expectation_6_month],
                        ["1-year expectation", row.expectation_1_year],
                        ["Selling style", row.selling_style],
                        ["Background industries", row.preferred_industries?.length ? row.preferred_industries.join(", ") : null],
                        ["Sells to industries", row.industries_sold_to?.length ? row.industries_sold_to.join(", ") : null],
                        ["Languages required", row.languages_required?.length ? row.languages_required.join(", ") : null],
                        [
                          "Week off",
                          row.week_off_type === "fixed"
                            ? row.week_off?.length
                              ? row.week_off.join(", ")
                              : null
                            : row.week_off_type === "rotational" && row.rotational_offs_per_week
                            ? `${row.rotational_offs_per_week}/week rotational${row.mandatory_working_days?.length ? ` (${row.mandatory_working_days.join(", ")} mandatory)` : ""}`
                            : null,
                        ],
                        ["Consumer types", row.b2c_customer_types?.length ? row.b2c_customer_types.join(", ") : null],
                        ["Client profile / talks to", row.client_profile?.length ? row.client_profile.join(", ") : null],
                        ["Company links", row.company_highlight_links?.length ? row.company_highlight_links.join(", ") : null],
                        ["Audience", row.audience],
                        ["Notes", row.notes],
                      ]
                        .filter(([, value]) => value)
                        .map(([label, value]) => (
                          <div key={label}>
                            <span className="text-slate-400 dark:text-slate-500">{label}: </span>
                            <span className="text-slate-700 dark:text-slate-300">{value}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {errorRowId === row.id && error && (
                    <p className="text-[11.5px] text-rose-600 dark:text-rose-400 mt-2">{error}</p>
                  )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <select
                    value={row.status}
                    onChange={(e) => setStatus(row.id, e.target.value as InquiryStatus)}
                    className="text-[12px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="dismissed">Dismissed</option>
                  </select>

                  {teamMembers.length > 0 && (() => {
                    const { specialists, others } = teamOptionsFor(row.category);
                    return (
                      <select
                        value={row.owner_id ?? ""}
                        onChange={(e) => assignOwner(row.id, e.target.value)}
                        disabled={assigningId === row.id}
                        className="text-[12px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                      >
                        <option value="">Assign owner...</option>
                        {specialists.length > 0 && (
                          <optgroup label="Matching specialists">
                            {specialists.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name ?? m.email}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label={specialists.length > 0 ? "Everyone else" : "Team"}>
                          {others.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name ?? m.email}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    );
                  })()}

                  {isMandate ? (
                    <button
                      onClick={() => createMandate(row)}
                      disabled={busyId === row.id}
                      className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-ros-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors duration-200 ease-ros"
                    >
                      <Briefcase className="w-3 h-3" />
                      {row.converted_mandate_id
                        ? "View mandate"
                        : busyId === row.id
                        ? "Preparing…"
                        : "Prepare Mandate"}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    row.company_name && (
                      <button
                        onClick={() => convertToClient(row)}
                        disabled={busyId === row.id}
                        className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-ros-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors duration-200 ease-ros"
                      >
                        <Building2 className="w-3 h-3" />
                        {row.converted_client_id
                          ? "View client"
                          : busyId === row.id
                          ? "Converting…"
                          : "Convert to Client"}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )
                  )}

                  {/* Not ready to be a mandate/client, or just want to keep
                      it warm without committing -- send it to the Sales
                      pipeline instead. Hidden once the inquiry has already
                      been converted some other way. */}
                  {row.company_name && !row.converted_mandate_id && !row.converted_client_id && (
                    <button
                      onClick={() => convertToSalesLead(row)}
                      disabled={busyId === row.id}
                      className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-ros-md bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 transition-colors duration-200 ease-ros"
                    >
                      <Users2 className="w-3 h-3" />
                      {row.converted_lead_id
                        ? "View sales lead"
                        : busyId === row.id
                        ? "Moving…"
                        : "Move to Sales Lead"}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-[13px] text-slate-500 dark:text-slate-400 text-center py-8">No inquiries in this filter.</p>
        )}
      </div>
    </div>
  );
}
