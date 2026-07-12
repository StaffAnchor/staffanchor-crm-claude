import { Building2, Inbox, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import EmployerInquiriesView, { type EmployerInquiryRow } from "./employer-inquiries-view";

// Landing page for BOTH leads coming in from staffanchor.com: the Contact
// Us form (name/email/phone/audience/message) and the /employers hiring
// mandate form (company/role/category/city/budget). Neither writes
// straight into a live table anymore -- a mandate submission used to
// insert directly into public.mandates via submit_mandate(), which meant
// any anonymous visitor's junk submission went instantly live as an open
// mandate (and therefore a public job listing on jobs.staffanchor.com)
// with zero review. Both paths now land here for triage; a recruiter
// explicitly promotes a reviewed one into a real Mandate or Client.
export default async function EmployerInquiriesPage() {
  const supabase = await createClient();

  const { data: inquiries } = await supabase
    .from("employer_inquiries")
    .select(
      "id, created_at, company_name, industry, custom_industry, full_name, designation, work_email, mobile_number, audience, message, role_title, category, city, budget_min, budget_max, source, status, notes, converted_client_id, converted_mandate_id, sub_domains, cities, experience_min, experience_max, hiring_reason, team_handling, team_size_band, work_mode, working_days, shift_timing, reporting_manager_title, company_size_band, company_highlight_links, sales_cycle, deal_size_currency, deal_size_band, customer_profile, expectation_3_month, expectation_6_month, expectation_1_year, selling_style, preferred_industries, industries_sold_to, languages_required"
    )
    .order("created_at", { ascending: false });

  const rows = (inquiries ?? []) as EmployerInquiryRow[];

  const counts = {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    converted: rows.filter((r) => r.status === "converted").length,
    dismissed: rows.filter((r) => r.status === "dismissed").length,
  };

  const statTiles = [
    { label: "Total inquiries", value: counts.total, icon: Building2, accent: true },
    { label: "New", value: counts.new, icon: Inbox },
    { label: "Converted", value: counts.converted, icon: CheckCircle2 },
    { label: "Dismissed", value: counts.dismissed, icon: XCircle },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Employer Inquiries</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            Mandate + Contact Us submissions from staffanchor.com, awaiting recruiter review
          </p>
        </div>
      </div>

      <div className="bg-slate-50/60 dark:bg-slate-800/50 rounded-ros-lg p-2 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statTiles.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label}>
                <StatTile label={t.label} value={t.value} icon={<Icon className="w-4 h-4" strokeWidth={2} />} accent={t.accent} />
              </div>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Building2 className="w-6 h-6 text-slate-400" />}
            title="No employer inquiries yet"
            description="Submissions from the staffanchor.com Employers and Contact forms will show up here."
          />
        </Card>
      ) : (
        <EmployerInquiriesView initialRows={rows} />
      )}
    </div>
  );
}
