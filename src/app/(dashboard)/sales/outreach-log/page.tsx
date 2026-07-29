import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OutreachLogView from "./outreach-log-view";
import type { OutreachLogRow } from "../outreach-log-constants";

// A separate space from the Sales Kanban board, on purpose -- most of the
// founder's 15-20/day manual LinkedIn/email outreach never becomes a real
// pipeline lead, so this is just a record + follow-up reminder, not another
// stage-tracked pipeline. See the sales_outreach_log migration.
export default async function OutreachLogPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("outreach_log")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(500);

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  const ownerNames: Record<string, string> = {};
  (profiles ?? []).forEach((p) => {
    ownerNames[p.id] = p.full_name ?? p.email ?? "Unknown";
  });

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <Link
            href="/sales"
            className="text-[11.5px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 mb-1 transition-colors duration-200 ease-ros"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Sales
          </Link>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Outreach Log</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            A record of LinkedIn/email outreach sent outside the CRM — this isn&apos;t connected to LinkedIn, so nothing logs
            itself. Log it here so a follow-up date doesn&apos;t get lost. Not every entry needs to become a Sales lead.
          </p>
        </div>
      </div>

      <OutreachLogView initialRows={(rows ?? []) as OutreachLogRow[]} ownerNames={ownerNames} />
    </div>
  );
}
