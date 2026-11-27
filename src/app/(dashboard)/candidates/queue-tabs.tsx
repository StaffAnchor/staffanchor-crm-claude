import { Suspense } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPriorityCalls } from "@/lib/priority-calls";
import { daysAgoIso, GAPS_FILTER, type Queue } from "@/lib/people-queues";

const TABS: { key: Queue | null; label: string; title: string }[] = [
  { key: "call", label: "Call today", title: "Paid calls first, then call-backs due, people who said yes to a role, and urgent roles" },
  { key: "new", label: "New this week", title: "Added in the last 7 days" },
  { key: "fits", label: "Fits an open role", title: "Strong or possible for an open role and not yet on it" },
  { key: "gaps", label: "New, missing CV or pay", title: "Added in the last 30 days without a CV or current pay" },
  { key: null, label: "Everyone", title: "The whole database" },
];

function Row({ active, counts }: { active: Queue | null; counts: Partial<Record<string, number>> }) {
  return (
    <>
      {TABS.map((t) => {
        const on = active === t.key;
        const n = counts[t.key ?? "all"];
        return (
          <Link key={t.label} href={t.key ? `/candidates?queue=${t.key}` : "/candidates"} title={t.title} aria-current={on ? "page" : undefined} className={`rounded-lg border px-3 py-1.5 text-[14px] font-medium ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>
            {t.label}
            {n !== undefined && <span className={`ml-1.5 tabular-nums ${on ? "text-teal-100" : "text-slate-400"}`}>{n.toLocaleString("en-IN")}</span>}
          </Link>
        );
      })}
    </>
  );
}

// Counted separately so a slow count never holds up the list itself.
async function Counted({ supabase, userId, active, total }: { supabase: SupabaseClient; userId: string | undefined; active: Queue | null; total: number }) {
  const head = () => supabase.from("candidates").select("id", { count: "exact", head: true });
  const [calls, fresh, fits, gaps] = await Promise.all([
    loadPriorityCalls(supabase, userId).then((r) => r.people.length).catch(() => undefined),
    head().gte("created_at", daysAgoIso(7)),
    supabase.from("candidate_role_fit").select("candidate_id", { count: "exact", head: true }).gt("suggested_count", 0),
    head().gte("created_at", daysAgoIso(30)).or(GAPS_FILTER),
  ]);
  return <Row active={active} counts={{ call: calls, new: fresh.count ?? undefined, fits: fits.count ?? undefined, gaps: gaps.count ?? undefined, all: total }} />;
}

export default function QueueTabs(props: { supabase: SupabaseClient; userId: string | undefined; active: Queue | null; total: number }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Work queues">
      <Suspense fallback={<Row active={props.active} counts={{ all: props.total }} />}>
        <Counted {...props} />
      </Suspense>
    </nav>
  );
}
