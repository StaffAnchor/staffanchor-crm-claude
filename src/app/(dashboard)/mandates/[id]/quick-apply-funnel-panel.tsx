import { createClient } from "@/lib/supabase/server";
import { TrendingUp } from "lucide-react";

// Funnel for this mandate's public Quick Apply flow on jobs.staffanchor.com:
// Clicked Quick Apply -> Submitted the form -> Went on to build their full
// profile. Clicks are logged client-side from the job listing page (see
// jobs-staffanchor's src/modules/jobs/api.ts logQuickApplyClick) and already
// exclude anyone whose own session resolves to a recruiter/admin profile, so
// this is external candidate interest only. "Submitted" counts unique
// candidate_mandate_links rows created by the quick_apply RPC specifically
// (added_by is null there -- every other insert path sets a real recruiter
// id). "Built full profile" is the subset of those whose candidate record
// has since reached status = 'registered', which is exactly what the
// candidate-portal ProfileEditor sets once a candidate saves a profile that
// meets the required-fields gate.
export default async function QuickApplyFunnelPanel({ mandateId }: { mandateId: string }) {
  const supabase = await createClient();

  const { count: clickCount } = await supabase
    .from("quick_apply_clicks")
    .select("*", { count: "exact", head: true })
    .eq("mandate_id", mandateId);

  const { data: quickApplyLinks } = await supabase
    .from("candidate_mandate_links")
    .select("candidate_id, candidates(status)")
    .eq("mandate_id", mandateId)
    .is("added_by", null);

  const clicks = clickCount ?? 0;
  const submitted = quickApplyLinks?.length ?? 0;
  const completed = (quickApplyLinks ?? []).filter(
    (l) => (l.candidates as unknown as { status: string } | null)?.status === "registered"
  ).length;

  const clickToSubmitPct = clicks > 0 ? Math.round((submitted / clicks) * 100) : null;
  const submitToCompletePct = submitted > 0 ? Math.round((completed / submitted) * 100) : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-3">
        <TrendingUp className="w-3.5 h-3.5 text-slate-400" /> Quick Apply funnel
      </h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3">
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{clicks}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Clicked Quick Apply</p>
        </div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 py-3">
          <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{submitted}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Submitted{clickToSubmitPct !== null ? ` · ${clickToSubmitPct}%` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 py-3">
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{completed}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Built profile{submitToCompletePct !== null ? ` · ${submitToCompletePct}%` : ""}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Clicks exclude recruiter/admin sessions. &quot;Built profile&quot; means the candidate has completed their
        full StaffAnchor profile since applying, not just the Quick Apply basics.
      </p>
    </div>
  );
}
