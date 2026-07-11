import { Building2, Inbox, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import EmployerInquiriesView, { type EmployerInquiryRow } from "./employer-inquiries-view";

// Landing page for employer submissions coming in from staffanchor.com
// (the /employers and /contact forms). Those forms still post to Google
// Sheets as they always have -- this table is a parallel, best-effort
// sync so a recruiter can triage new inbound leads and convert one
// straight into a Client without ever opening the spreadsheet.
export default async function EmployerInquiriesPage() {
  const supabase = await createClient();

  const { data: inquiries } = await supabase
    .from("employer_inquiries")
    .select(
      "id, created_at, company_name, industry, custom_industry, full_name, designation, work_email, mobile_number, source, status, notes, converted_client_id"
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
            Employer form submissions from staffanchor.com, synced here for triage
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
