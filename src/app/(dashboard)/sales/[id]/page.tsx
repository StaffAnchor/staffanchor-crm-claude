import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Mail, Phone, Link2, Globe } from "lucide-react";
import { SOURCE_LABEL, formatDealValue, type SalesActivityRow, type SalesLeadRow } from "../sales-constants";
import LeadActivityPanel from "./lead-activity-panel";
import LeadEditPanel from "./lead-edit-panel";

export default async function SalesLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead } = await supabase.from("sales_leads").select("*").eq("id", id).single();
  if (!lead) notFound();

  const { data: activities } = await supabase
    .from("sales_lead_activities")
    .select("*")
    .eq("lead_id", id)
    .order("at", { ascending: false });

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  const actorNames: Record<string, string> = {};
  (profiles ?? []).forEach((p) => {
    actorNames[p.id] = p.full_name ?? p.email ?? "Unknown";
  });

  const row = lead as SalesLeadRow;

  return (
    <div>
      <Link href="/sales" className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> All leads
      </Link>

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-ros-full bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200/60 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{row.company_name}</h1>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                {row.contact_name}
                {row.contact_name && row.contact_title ? " · " : ""}
                {row.contact_title}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <Badge tone="accent" size="sm" className="normal-case tracking-normal">
                  {SOURCE_LABEL[row.source] ?? row.source}
                </Badge>
                {row.deal_value != null && (
                  <Badge tone="success" size="sm" className="normal-case tracking-normal">
                    {formatDealValue(row.deal_value, row.deal_value_currency)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[12.5px]">
          {row.contact_email && (
            <a href={`mailto:${row.contact_email}`} className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors duration-200 ease-ros">
              <Mail className="w-3.5 h-3.5 shrink-0" /> {row.contact_email}
            </a>
          )}
          {row.contact_phone && (
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Phone className="w-3.5 h-3.5 shrink-0" /> {row.contact_phone}
            </span>
          )}
          {row.company_domain && (
            <a
              href={row.company_domain.startsWith("http") ? row.company_domain : `https://${row.company_domain}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors duration-200 ease-ros"
            >
              <Globe className="w-3.5 h-3.5 shrink-0" /> {row.company_domain}
            </a>
          )}
          {row.linkedin_url && (
            <a href={row.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors duration-200 ease-ros">
              <Link2 className="w-3.5 h-3.5 shrink-0" /> LinkedIn profile
            </a>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <LeadEditPanel lead={row} />
        <LeadActivityPanel lead={row} activities={(activities ?? []) as SalesActivityRow[]} actorNames={actorNames} />
      </div>
    </div>
  );
}
