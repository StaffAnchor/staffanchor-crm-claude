import { createClient } from "@/lib/supabase/server";
import { TrendingUp, MapPin, Link2, Smartphone } from "lucide-react";

// Funnel for this mandate's public Quick Apply flow on jobs.staffanchor.com:
// Clicked Quick Apply -> Form opened -> Submitted the form -> Went on to
// build their full profile. Clicks and form-opens are logged server-side via
// /api/log-click on jobs-staffanchor (see that route + src/modules/jobs/api.ts
// logQuickApplyClick / logQuickApplyFormOpened) and already exclude anyone
// whose own session resolves to a recruiter/admin profile, so this is
// external candidate interest only. "Form opened" is a distinct event from
// "clicked" -- it fires when the apply form/card actually mounts, so the gap
// between the two surfaces candidates who clicked but bounced before the
// form ever loaded. "Submitted" counts unique candidate_mandate_links rows
// created by the quick_apply RPC specifically (added_by is null there --
// every other insert path sets a real recruiter id). "Built full profile" is
// the subset of those whose candidate record has since reached
// status = 'registered', which is exactly what the candidate-portal
// ProfileEditor sets once a candidate saves a profile that meets the
// required-fields gate.
export default async function QuickApplyFunnelPanel({ mandateId }: { mandateId: string }) {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("quick_apply_clicks")
    .select("event_type, referrer, utm_source, utm_medium, device_type, browser, city, country")
    .eq("mandate_id", mandateId);

  const { data: quickApplyLinks } = await supabase
    .from("candidate_mandate_links")
    .select("candidate_id, candidates(status)")
    .eq("mandate_id", mandateId)
    .is("added_by", null);

  const allEvents = events ?? [];
  const clicks = allEvents.filter((e) => e.event_type === "click").length;
  const formsOpened = allEvents.filter((e) => e.event_type === "form_opened").length;
  const submitted = quickApplyLinks?.length ?? 0;
  const completed = (quickApplyLinks ?? []).filter(
    (l) => (l.candidates as unknown as { status: string } | null)?.status === "registered"
  ).length;

  const clickToOpenPct = clicks > 0 ? Math.round((formsOpened / clicks) * 100) : null;
  const openToSubmitPct = formsOpened > 0 ? Math.round((submitted / formsOpened) * 100) : null;
  const submitToCompletePct = submitted > 0 ? Math.round((completed / submitted) * 100) : null;

  // Breakdowns pull from all logged events (click + form_opened combined) --
  // this is about where interest is coming from, not funnel stage.
  const locationCounts = tally(
    allEvents.map((e) => {
      const bits = [e.city, e.country].filter(Boolean);
      return bits.length ? bits.join(", ") : null;
    })
  );
  const referrerCounts = tally(
    allEvents.map((e) => {
      if (e.utm_source) return e.utm_medium ? `${e.utm_source} / ${e.utm_medium}` : e.utm_source;
      if (!e.referrer) return "Direct / no referrer";
      try {
        return new URL(e.referrer).hostname.replace(/^www\./, "");
      } catch {
        return e.referrer;
      }
    })
  );
  const deviceCounts = tally(allEvents.map((e) => e.device_type));
  const browserCounts = tally(allEvents.map((e) => e.browser));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-3">
        <TrendingUp className="w-3.5 h-3.5 text-slate-400" /> Quick Apply funnel
      </h2>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3">
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{clicks}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Clicked</p>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3">
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formsOpened}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Form opened{clickToOpenPct !== null ? ` · ${clickToOpenPct}%` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 py-3">
          <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{submitted}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Submitted{openToSubmitPct !== null ? ` · ${openToSubmitPct}%` : ""}
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
        Events exclude recruiter/admin sessions. &quot;Form opened&quot; means the candidate's apply form actually
        loaded, not just that they clicked Quick Apply. &quot;Built profile&quot; means the candidate has completed
        their full StaffAnchor profile since applying.
      </p>

      {allEvents.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BreakdownList icon={MapPin} title="Location" rows={locationCounts} />
          <BreakdownList icon={Link2} title="Traffic source" rows={referrerCounts} />
          <BreakdownList
            icon={Smartphone}
            title="Device / browser"
            rows={[...deviceCounts, ...browserCounts].sort((a, b) => b.count - a.count).slice(0, 5)}
          />
        </div>
      )}
    </div>
  );
}

function tally(values: (string | null | undefined)[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function BreakdownList({
  icon: Icon,
  title,
  rows,
}: {
  icon: typeof MapPin;
  title: string;
  rows: { label: string; count: number }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-2">
        <Icon className="w-3 h-3" /> {title}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-slate-700 dark:text-slate-300 truncate pr-2">{r.label}</span>
            <span className="text-slate-400 dark:text-slate-500 shrink-0">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
