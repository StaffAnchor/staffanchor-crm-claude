import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEVEL_OPTIONS } from "@/lib/role-type";
import SampleChecker, { type Sample } from "./sample-checker";

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  wrong_role: "Different kind of job",
  wrong_level: "Wrong seniority",
  wrong_world: "Sells something else",
  wrong_city: "Location doesn't work",
  pay_too_high: "Pay too high",
  not_interested: "Not interested",
  other: "Other",
};

const nowMs = () => Date.now();
const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);

export default async function ScorecardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/today");

  const since = new Date(nowMs() - 7 * 86400000).toISOString();
  const [timings, checks, dismissals, clusters, tagCount] = await Promise.all([
    Promise.resolve(supabase.from("page_timings").select("route, ms").gte("at", since).limit(5000)),
    Promise.resolve(supabase.from("tag_checks").select("candidate_id, verdict, tagged_cluster, correct_cluster").limit(5000)),
    Promise.resolve(supabase.from("match_dismissals").select("reason").limit(5000)),
    Promise.resolve(supabase.from("role_clusters").select("slug, name").order("sort_order")),
    Promise.resolve(supabase.from("candidate_role_tags").select("candidate_id", { count: "exact", head: true }).eq("is_current", true).neq("source", "recruiter")),
  ]);

  const byRoute = new Map<string, number[]>();
  for (const t of timings.data ?? []) (byRoute.get(t.route) ?? byRoute.set(t.route, []).get(t.route)!).push(t.ms);

  const checked = new Set((checks.data ?? []).map((c) => c.candidate_id));
  const right = (checks.data ?? []).filter((c) => c.verdict === "right").length;
  const total = (checks.data ?? []).length;

  const reasons = new Map<string, number>();
  for (const d of dismissals.data ?? []) reasons.set(d.reason, (reasons.get(d.reason) ?? 0) + 1);

  const total_tags = tagCount.count ?? 0;
  const offset = total_tags > 60 ? nowMs() % (total_tags - 60) : 0;
  const { data: pool } = await supabase
    .from("candidate_role_tags")
    .select("candidate_id, cluster_slug, seniority, candidates(full_name, current_job_title, current_employer)")
    .eq("is_current", true)
    .neq("source", "recruiter")
    .range(offset, offset + 59);
  const samples: Sample[] = ((pool ?? []) as unknown as { candidate_id: string; cluster_slug: string; seniority: string; candidates: { full_name: string | null; current_job_title: string | null; current_employer: string | null } | null }[])
    .filter((r) => !checked.has(r.candidate_id) && r.candidates)
    .slice(0, 10)
    .map((r) => ({ candidate_id: r.candidate_id, cluster: r.cluster_slug, level: r.seniority, name: r.candidates?.full_name ?? "Unnamed", title: r.candidates?.current_job_title ?? null, employer: r.candidates?.current_employer ?? null }));

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Scorecard</h1>
        <p className="mt-1 text-sm text-slate-500">How accurate and how fast the system is, measured, not assumed. Admin only.</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Classification accuracy</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          {total === 0 ? "No checks yet. Check a few below to get a real accuracy number." : `${right} of ${total} checked tags were right (${Math.round((right / total) * 100)}%).`}
          {total > 0 && total < 50 && " Small sample, so treat it as a rough guide until you pass 50."}
        </p>
        <SampleChecker samples={samples} clusters={clusters.data ?? []} levels={LEVEL_OPTIONS.map((l) => ({ value: l.value, label: l.label.split(" (")[0] }))} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Page speed, last 7 days</h2>
        {byRoute.size === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded yet. Open a mandate and a candidate page, then come back.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 font-medium">Page</th>
                <th className="py-1 font-medium">Opens</th>
                <th className="py-1 font-medium">Typical (p50)</th>
                <th className="py-1 font-medium">Slow (p95)</th>
              </tr>
            </thead>
            <tbody>
              {[...byRoute].map(([route, ms]) => {
                const s = [...ms].sort((a, b) => a - b);
                return (
                  <tr key={route} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 capitalize">{route}</td>
                    <td className="py-1.5 tabular-nums">{s.length}</td>
                    <td className="py-1.5 tabular-nums">{pct(s, 50)} ms</td>
                    <td className="py-1.5 tabular-nums">{pct(s, 95)} ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-slate-400">Time to load the page&apos;s data on the server, not including your network or browser.</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Why matches were marked not a fit</h2>
        {reasons.size === 0 ? (
          <p className="text-sm text-slate-500">None yet. Use &quot;Not a fit&quot; on a mandate&apos;s best matches and the reasons show here.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {[...reasons].sort((a, b) => b[1] - a[1]).map(([r, n]) => (
              <li key={r} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
                <span>{REASON_LABEL[r] ?? r}</span>
                <span className="tabular-nums text-slate-500">{n}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">
          People marked not a fit stop appearing for that mandate. Ranking weights are not changed automatically: with this few outcomes it would be guessing. Revisit once there are a few hundred.
        </p>
      </section>

      <Link href="/candidates/inventory" className="text-sm font-medium text-teal-700 hover:underline">
        Back to Talent inventory
      </Link>
    </div>
  );
}
