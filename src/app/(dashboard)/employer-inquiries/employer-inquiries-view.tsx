"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, Building2, Briefcase, ArrowRight } from "lucide-react";
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
  // Set only when this brief was submitted by a client who already has
  // Client Portal access (self-service, no shareable link needed) --
  // lets Create Mandate auto-link the new mandate to their existing
  // client record instead of leaving mandates.client_id unset.
  existing_client_id: string | null;
}

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

export default function EmployerInquiriesView({ initialRows }: { initialRows: EmployerInquiryRow[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initialRows);
  const [activeFilter, setActiveFilter] = useState<InquiryStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Recruiter-gated publish step: a mandate submitted from the staffanchor.com
  // /employers form lands here, not in public.mandates directly, so a junk
  // or spam submission can never appear live on jobs.staffanchor.com without
  // someone on the team explicitly reviewing it first and clicking this.
  async function createMandate(row: EmployerInquiryRow) {
    if (row.converted_mandate_id) {
      router.push(`/mandates/${row.converted_mandate_id}`);
      return;
    }
    if (!row.company_name || !row.role_title) return;
    setBusyId(row.id);
    setError(null);
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

      const cities = row.cities ?? (row.city ? [row.city] : []);
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
          notes: contactLines,
          status: "open",
        })
        .select("id")
        .single();
      if (mandateError || !mandate) throw mandateError ?? new Error("Failed to create mandate");

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
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
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

      {error && (
        <p className="text-[12px] text-rose-600 dark:text-rose-400 mb-3">{error}</p>
      )}

      <div className="space-y-2.5">
        {filtered.map((row) => {
          const isMandate = (row.source === "employers_page" || row.source === "client_mandate_request") && !!row.role_title;
          return (
            <Card key={row.id} padded={false} className="p-4">
              <div className="flex items-start justify-between gap-4">
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
                    <p className="text-[12.5px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{row.message}</p>
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
                        ? "Creating…"
                        : "Create Mandate"}
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
