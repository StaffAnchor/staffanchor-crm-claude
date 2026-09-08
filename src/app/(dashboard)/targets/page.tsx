import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import TargetEditor from "./target-editor";

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(monthStart: string) {
  const d = new Date(monthStart + "T00:00:00Z");
  return `${MONTH_LABEL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function lastDayOfMonth(monthStart: string): Date {
  const d = new Date(monthStart + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}
function daysInMonth(monthStart: string): number {
  return lastDayOfMonth(monthStart).getUTCDate();
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const STATUS_TONE: Record<string, BadgeTone> = {
  Met: "success",
  Ahead: "success",
  "On Track": "accent",
  Behind: "danger",
  Missed: "danger",
  Upcoming: "neutral",
};

// Admin-only FY2026-27 placement target tracker (Sep 2026 - Mar 2027, the
// remaining months of the financial year). Targets live in
// fy_placement_targets (admin-editable inline); actuals are computed live
// from candidate_mandate_links (stage='placed', date_of_joining) so this
// never drifts out of sync with the real pipeline data -- no separate
// "log a placement here too" step for recruiters to forget. Client
// onboarding (clients.created_at) is tracked alongside placements but has
// no fixed target, per the ask ("should also be tracked", not a number).
export default async function TargetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "admin") {
    redirect("/candidates");
  }

  const { data: targets } = await supabase
    .from("fy_placement_targets")
    .select("month_start, target_placements, target_clients")
    .order("month_start", { ascending: true });

  const months = targets ?? [];
  if (months.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-5 py-8">
        <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">FY Targets</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-2">No targets configured yet.</p>
      </div>
    );
  }

  const fyStart = months[0].month_start as string;
  const fyEndDate = lastDayOfMonth(months[months.length - 1].month_start as string);

  const { data: placedLinks } = await supabase
    .from("candidate_mandate_links")
    .select("date_of_joining, candidates(full_name), mandates(role_title, client_name)")
    .eq("stage", "placed")
    .gte("date_of_joining", fyStart)
    .lte("date_of_joining", fyEndDate.toISOString().slice(0, 10));

  const { data: newClients } = await supabase
    .from("clients")
    .select("id, name, created_at")
    .gte("created_at", `${fyStart}T00:00:00Z`)
    .lte("created_at", fyEndDate.toISOString());

  type Placement = { date_of_joining: string; candidate_name: string; role_title: string; client_name: string };
  const placements: Placement[] = (placedLinks ?? []).map((r) => {
    const cand = r.candidates as unknown as { full_name: string } | null;
    const mand = r.mandates as unknown as { role_title: string; client_name: string } | null;
    return {
      date_of_joining: r.date_of_joining as string,
      candidate_name: cand?.full_name ?? "—",
      role_title: mand?.role_title ?? "—",
      client_name: mand?.client_name ?? "—",
    };
  });

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  // Monthly rollup
  const monthlyRows = months.map((m) => {
    const monthStart = m.month_start as string;
    const monthStartDate = new Date(monthStart + "T00:00:00Z");
    const monthEndDate = lastDayOfMonth(monthStart);
    const actual = placements.filter((p) => p.date_of_joining >= monthStart && p.date_of_joining <= monthEndDate.toISOString().slice(0, 10)).length;
    const clientsOnboarded = (newClients ?? []).filter((c) => {
      const ca = new Date(c.created_at as string);
      return ca >= monthStartDate && ca <= new Date(monthEndDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    }).length;

    let status: string;
    if (todayUTC > monthEndDate) {
      status = actual >= m.target_placements ? "Met" : "Missed";
    } else if (todayUTC < monthStartDate) {
      status = "Upcoming";
    } else {
      const totalDays = daysInMonth(monthStart);
      const elapsedDays = Math.min(totalDays, Math.floor((todayUTC.getTime() - monthStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      const expectedToDate = (m.target_placements * elapsedDays) / totalDays;
      status = actual >= expectedToDate * 1.15 ? "Ahead" : actual >= expectedToDate * 0.85 ? "On Track" : "Behind";
    }

    return { monthStart, target: m.target_placements as number, actual, clientsOnboarded, status };
  });

  const totalTarget = monthlyRows.reduce((s, r) => s + r.target, 0);
  const totalActual = monthlyRows.reduce((s, r) => s + r.actual, 0);
  const totalClients = monthlyRows.reduce((s, r) => s + r.clientsOnboarded, 0);
  const pctComplete = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

  const fyTotalDays = Math.round((fyEndDate.getTime() - new Date(fyStart + "T00:00:00Z").getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const fyElapsedDays = Math.min(
    fyTotalDays,
    Math.max(0, Math.round((todayUTC.getTime() - new Date(fyStart + "T00:00:00Z").getTime()) / (24 * 60 * 60 * 1000)) + 1)
  );
  const fyExpectedToDate = totalTarget * (fyElapsedDays / fyTotalDays);
  const fyPace = totalActual >= fyExpectedToDate * 1.1 ? "Ahead of pace" : totalActual >= fyExpectedToDate * 0.9 ? "On pace" : "Behind pace";
  const fyPaceTone: BadgeTone = fyPace === "Ahead of pace" ? "success" : fyPace === "On pace" ? "accent" : "danger";

  // Weekly buckets: Monday-start weeks spanning fyStart..fyEnd. A week is
  // grouped under the month its Monday falls in -- simplest unambiguous
  // rule for the handful of boundary weeks that straddle two months.
  const weeks: { start: Date; end: Date; monthStart: string }[] = [];
  {
    const fyStartDate = new Date(fyStart + "T00:00:00Z");
    const dow = fyStartDate.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (dow + 6) % 7;
    const cursor = new Date(fyStartDate);
    cursor.setUTCDate(cursor.getUTCDate() - daysSinceMonday);
    while (cursor <= fyEndDate) {
      const weekEnd = new Date(cursor);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const belongsMonth = months.find((m) => {
        const ms = new Date((m.month_start as string) + "T00:00:00Z");
        return cursor.getUTCFullYear() === ms.getUTCFullYear() && cursor.getUTCMonth() === ms.getUTCMonth();
      });
      weeks.push({ start: new Date(cursor), end: weekEnd, monthStart: (belongsMonth?.month_start as string) ?? months[0].month_start as string });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  let cumulativePlacements = 0;
  let cumulativeClients = 0;
  const weeklyRows = weeks.map((w) => {
    const startStr = w.start.toISOString().slice(0, 10);
    const endStr = w.end.toISOString().slice(0, 10);
    const weekPlacements = placements.filter((p) => p.date_of_joining >= startStr && p.date_of_joining <= endStr).length;
    const weekClients = (newClients ?? []).filter((c) => {
      const d = new Date(c.created_at as string).toISOString().slice(0, 10);
      return d >= startStr && d <= endStr;
    }).length;
    cumulativePlacements += weekPlacements;
    cumulativeClients += weekClients;
    const isFuture = w.start > todayUTC;
    return {
      label: `${fmtDate(w.start)} - ${fmtDate(w.end)}`,
      monthStart: w.monthStart,
      placements: weekPlacements,
      cumulativePlacements,
      clients: weekClients,
      cumulativeClients,
      isFuture,
    };
  });

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">FY Targets</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-6">
        Placement targets for the remaining months of FY2026-27 ({monthLabel(fyStart)} – {monthLabel(months[months.length - 1].month_start as string)}), tracked weekly. Admin-only.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">FY Target</p>
          <p className="text-[22px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">{totalTarget}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Placed So Far</p>
          <p className="text-[22px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">{totalActual}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">% Complete</p>
          <p className="text-[22px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">{pctComplete}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pace</p>
          <Badge tone={fyPaceTone} className="mt-1.5">{fyPace}</Badge>
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Clients onboarded (FY to date)</h2>
          <span className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{totalClients}</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">No fixed target set for client onboarding -- tracked for visibility alongside placements.</p>
      </Card>

      <Card className="mb-6" padded={false}>
        <div className="p-4 pb-2">
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Monthly targets</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide border-y border-slate-100 dark:border-slate-800">
            <tr>
              <th className="text-left px-4 py-2.5">Month</th>
              <th className="text-left px-4 py-2.5">Target</th>
              <th className="text-left px-4 py-2.5">Placed</th>
              <th className="text-left px-4 py-2.5">Variance</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Clients Onboarded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {monthlyRows.map((r) => (
              <tr key={r.monthStart}>
                <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{monthLabel(r.monthStart)}</td>
                <td className="px-4 py-2.5">
                  <TargetEditor monthStart={r.monthStart} currentTarget={r.target} />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">{r.actual}</td>
                <td className={`px-4 py-2.5 tabular-nums ${r.actual - r.target >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {r.actual - r.target >= 0 ? "+" : ""}
                  {r.actual - r.target}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={STATUS_TONE[r.status] ?? "neutral"} size="sm">{r.status}</Badge>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">{r.clientsOnboarded}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-800/40 font-semibold">
              <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">Total</td>
              <td className="px-4 py-2.5 tabular-nums text-slate-900 dark:text-slate-100">{totalTarget}</td>
              <td className="px-4 py-2.5 tabular-nums text-slate-900 dark:text-slate-100">{totalActual}</td>
              <td className={`px-4 py-2.5 tabular-nums ${totalActual - totalTarget >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {totalActual - totalTarget >= 0 ? "+" : ""}
                {totalActual - totalTarget}
              </td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 tabular-nums text-slate-900 dark:text-slate-100">{totalClients}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card padded={false}>
        <div className="p-4 pb-2">
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Weekly breakdown</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Each week is grouped under the month its Monday falls in.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide border-y border-slate-100 dark:border-slate-800">
            <tr>
              <th className="text-left px-4 py-2.5">Week</th>
              <th className="text-left px-4 py-2.5">Month</th>
              <th className="text-left px-4 py-2.5">Placements</th>
              <th className="text-left px-4 py-2.5">Cumulative</th>
              <th className="text-left px-4 py-2.5">Clients Onboarded</th>
              <th className="text-left px-4 py-2.5">Cumulative Clients</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {weeklyRows.map((w, i) => (
              <tr key={i} className={w.isFuture ? "opacity-50" : ""}>
                <td className="px-4 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{w.label}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{monthLabel(w.monthStart)}</td>
                <td className="px-4 py-2 tabular-nums text-slate-900 dark:text-slate-100 font-medium">{w.placements}</td>
                <td className="px-4 py-2 tabular-nums text-slate-500 dark:text-slate-400">{w.cumulativePlacements}</td>
                <td className="px-4 py-2 tabular-nums text-slate-900 dark:text-slate-100 font-medium">{w.clients}</td>
                <td className="px-4 py-2 tabular-nums text-slate-500 dark:text-slate-400">{w.cumulativeClients}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
