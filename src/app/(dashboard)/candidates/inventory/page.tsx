import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import RecalculateButton from "./recalculate-button";
import ClassifyButton from "./classify-button";
import SaveShortlist from "../../saas-practice/save-shortlist";
import { DOMAINS, LEVELS, METROS, SENIORITY_SHORT, TRACKS, inventoryHref, parseParams } from "@/lib/inventory";
import { POOL_TIER_LABEL, POOL_TIER_PILL, type PoolTier } from "@/lib/talent-pool";

export const dynamic = "force-dynamic";

type Cluster = { slug: string; name: string; track: string; family: string; sort_order: number };
type Cell = { cluster_slug: string; metro: string; n: number };

const shade = (n: number, max: number) => {
  if (n === 0) return "text-slate-300 dark:text-slate-700";
  const r = n / Math.max(max, 1);
  if (r > 0.66) return "bg-teal-600 text-white font-semibold";
  if (r > 0.33) return "bg-teal-300/70 text-teal-950 font-semibold dark:bg-teal-700/60 dark:text-white";
  if (r > 0.12) return "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100";
  return "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200";
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseParams(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) redirect("/candidates");

  const level = LEVELS.find((l) => l.key === p.level) ?? LEVELS[0];
  const [{ data: clusterRows }, { data: countRows }, { data: unclassifiedIds }] = await Promise.all([
    supabase.from("role_clusters").select("slug, name, track, family, sort_order").order("sort_order"),
    supabase.rpc("inventory_counts", { p_track: p.track, p_domain: p.domain, p_current_only: p.scope === "current", p_seniority: level.senior }),
    supabase.rpc("inventory_unclassified", { p_track: p.track }),
  ]);
  const clusters = (clusterRows ?? []) as Cluster[];
  const cells = (countRows ?? []) as Cell[];

  const byCluster = new Map<string, Map<string, number>>();
  for (const c of cells) {
    const m = byCluster.get(c.cluster_slug) ?? new Map<string, number>();
    m.set(c.metro, Number(c.n));
    byCluster.set(c.cluster_slug, m);
  }
  const rows = clusters
    .filter((c) => byCluster.has(c.slug))
    .map((c) => {
      const m = byCluster.get(c.slug)!;
      const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
      return { ...c, m, total };
    });
  const max = Math.max(1, ...rows.flatMap((r) => Array.from(r.m.values())));
  const families = Array.from(new Set(rows.map((r) => r.family)));
  const metroTotals = new Map<string, number>(METROS.map((x) => [x, 0]));
  for (const r of rows) for (const [k, v] of r.m) metroTotals.set(k, (metroTotals.get(k) ?? 0) + v);

  // Drill-down: who is behind a number.
  type Person = { candidate_id: string; seniority: string; matched_title: string | null; metro: string | null; is_current: boolean; candidates: { full_name: string | null; current_job_title: string | null; current_employer: string | null; total_experience_years: number | string | null; current_fixed_ctc: number | string | null; expected_fixed_ctc: number | string | null; notice_period: string | null } | null };
  let people: Person[] = [];
  let drillTitle = "";
  const unclassifiedCount = ((unclassifiedIds ?? []) as { candidate_id: string }[]).length;
  if (p.cluster === "none") {
    drillTitle = "Not classified yet";
    const ids = ((unclassifiedIds ?? []) as { candidate_id: string }[]).map((x) => x.candidate_id).slice(0, 300);
    const { data } = ids.length
      ? await supabase.from("candidates").select("id, full_name, current_job_title, current_employer, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period").in("id", ids)
      : { data: [] };
    people = ((data ?? []) as { id: string; full_name: string | null; current_job_title: string | null; current_employer: string | null; total_experience_years: number | string | null; current_fixed_ctc: number | string | null; expected_fixed_ctc: number | string | null; notice_period: string | null }[]).map((c) => ({
      candidate_id: c.id,
      seniority: "ic",
      matched_title: null,
      metro: null,
      is_current: true,
      candidates: c,
    }));
  } else if (p.cluster) {
    const cl = clusters.find((c) => c.slug === p.cluster);
    drillTitle = `${cl?.name ?? p.cluster}${p.metro ? ` in ${p.metro}` : ""}`;
    let q = supabase
      .from("candidate_role_tags")
      .select("candidate_id, seniority, matched_title, metro, is_current, candidates(full_name, current_job_title, current_employer, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period)")
      .eq("cluster_slug", p.cluster)
      .eq("track", p.track);
    if (p.domain) q = q.eq("domain", p.domain);
    if (p.scope === "current") q = q.eq("is_current", true);
    if (level.senior) q = q.in("seniority", level.senior);
    if (p.metro) q = q.eq("metro", p.metro);
    const { data } = await q.limit(400);
    const seen = new Set<string>();
    people = ((data ?? []) as unknown as Person[]).filter((x) => (seen.has(x.candidate_id) ? false : (seen.add(x.candidate_id), true)));
    people.sort((a, b) => Number(b.candidates?.total_experience_years ?? 0) - Number(a.candidates?.total_experience_years ?? 0));
  }
  const { data: listRows } = await supabase.rpc("candidate_lists_with_counts");
  const lists = ((listRows ?? []) as { id: string; name: string; n: number | string; owner_name: string | null }[]).map((l) => ({ id: l.id, name: l.name, n: Number(l.n), owner_name: l.owner_name }));
  const poolBy = new Map<string, PoolTier>();
  if (people.length > 0) {
    const { data: pool } = await supabase.from("talent_pool_entries").select("candidate_id, tier").in("candidate_id", people.map((x) => x.candidate_id));
    for (const e of (pool ?? []) as { candidate_id: string; tier: PoolTier }[]) poolBy.set(e.candidate_id, e.tier);
  }

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-[12.5px] font-medium ${on ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`;
  const exportHref = p.cluster && p.cluster !== "none" ? `/api/inventory/export?${new URLSearchParams({ track: p.track, ...(p.domain ? { domain: p.domain } : {}), scope: p.scope, level: p.level, cluster: p.cluster, ...(p.metro ? { metro: p.metro } : {}) }).toString()}` : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6">
      <CandidatesSubNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Talent inventory</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
            What you hold, by kind of role and by city, whether or not a mandate is open. Pick a track, then click any number to see the people behind it.
          </p>
        </div>
        {me.role === "admin" && (
          <div className="flex flex-wrap items-center gap-3">
            <ClassifyButton verb="Classify" />
            <ClassifyButton endpoint="/api/admin/inventory/selling" verb="Write selling profiles for" title="The AI writes what each sales person sells, to whom and how, from their CV facts" allowRecheck={false} />
            <RecalculateButton />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-700">
          {TRACKS.map((t) => (
            <Link key={t.value} href={inventoryHref(p, { track: t.value, domain: null, cluster: null, metro: null })} className={chip(p.track === t.value)}>
              {t.label}
            </Link>
          ))}
        </div>
        {(DOMAINS[p.track] ?? []).length > 1 && (
          <div className="flex items-center gap-1">
            {DOMAINS[p.track].map((d) => (
              <Link key={d.label} href={inventoryHref(p, { domain: d.value, cluster: null, metro: null })} className={chip(p.domain === d.value)}>
                {d.label}
              </Link>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          {LEVELS.map((l) => (
            <Link key={l.key} href={inventoryHref(p, { level: l.key, cluster: null, metro: null })} className={chip(p.level === l.key)}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={inventoryHref(p, { scope: "current", cluster: null, metro: null })} className={chip(p.scope === "current")}>
            Role now
          </Link>
          <Link href={inventoryHref(p, { scope: "any", cluster: null, metro: null })} className={chip(p.scope === "any")} title="Count someone if they have ever held this kind of role">
            Ever held
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-ros-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium dark:bg-slate-900">Kind of role</th>
              {METROS.map((m) => (
                <th key={m} className="px-2 py-2.5 text-center text-xs font-medium">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={METROS.length + 2} className="px-4 py-8 text-center text-slate-500">
                  Nothing here yet for these filters.
                </td>
              </tr>
            )}
            {families.map((f) => {
              const fr = rows.filter((r) => r.family === f);
              return (
                <FamilyBlock key={f} family={f} rows={fr} p={p} max={max} />
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-800/50">
                <td className="sticky left-0 bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50">All roles shown</td>
                {METROS.map((m) => (
                  <td key={m} className="px-2 py-2.5 text-center tabular-nums">
                    {metroTotals.get(m) ?? 0}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right tabular-nums">{grandTotal}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[12px] text-slate-500 dark:text-slate-400">
        A person can appear in more than one row (for example someone who is both an Account Executive and a Solution Engineer), so totals are counts of roles, not people.{" "}
        {unclassifiedCount > 0 && (
          <Link href={inventoryHref(p, { cluster: "none", metro: null })} className="font-medium text-teal-600 hover:underline">
            {unclassifiedCount} in {TRACKS.find((t) => t.value === p.track)?.label} have a current role the rules don&apos;t recognise yet. See who.
          </Link>
        )}
      </p>

      {p.cluster && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {drillTitle} <span className="font-normal text-slate-400">({people.length}{people.length >= 400 ? "+" : ""})</span>
            </h2>
            {p.metro && (
              <Link href={inventoryHref(p, { metro: null })} className="text-[12px] text-teal-600 hover:underline">
                Show all cities
              </Link>
            )}
            {people.length > 0 && (
              <SaveShortlist
                ids={people.map((x) => x.candidate_id)}
                label={`Save these ${Math.min(people.length, 300)} as a shortlist`}
                defaultName={`${drillTitle} ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                description={`Made from the Talent Inventory: ${drillTitle}${p.domain ? `, ${p.domain}` : ""}${p.level !== "all" ? `, ${level.label.toLowerCase()}` : ""}.`}
                lists={lists}
              />
            )}
            {exportHref && (
              <a href={exportHref} className="text-[12px] font-medium text-teal-600 hover:underline">
                Download as CSV
              </a>
            )}
            <Link href={inventoryHref(p, { cluster: null, metro: null })} className="ml-auto text-[12px] text-slate-500 hover:underline">
              Close
            </Link>
          </div>
          <div className="overflow-x-auto rounded-ros-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500 dark:border-slate-800">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role and company</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">City</th>
                  <th className="px-3 py-2 text-right font-medium">Exp</th>
                  <th className="px-3 py-2 font-medium">CTC (now → expected)</th>
                  <th className="px-3 py-2 font-medium">Notice</th>
                </tr>
              </thead>
              <tbody>
                {people.map((x) => {
                  const c = x.candidates;
                  const tier = poolBy.get(x.candidate_id);
                  return (
                    <tr key={x.candidate_id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                      <td className="px-4 py-2">
                        <Link href={`/candidates/${x.candidate_id}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                          {c?.full_name ?? "Unnamed"}
                        </Link>
                        {tier && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${POOL_TIER_PILL[tier]}`}>{POOL_TIER_LABEL[tier]}</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{[x.matched_title ?? c?.current_job_title, c?.current_employer].filter(Boolean).join(" at ") || "Not known"}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{SENIORITY_SHORT[x.seniority] ?? x.seniority}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{x.metro ?? ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c?.total_experience_years != null ? Number(c.total_experience_years) : ""}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                        {c?.current_fixed_ctc != null ? `${Number(c.current_fixed_ctc)}` : "?"} → {c?.expected_fixed_ctc != null ? `${Number(c.expected_fixed_ctc)}` : "?"} LPA
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{c?.notice_period ?? ""}</td>
                    </tr>
                  );
                })}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      No one matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function FamilyBlock({ family, rows, p, max }: { family: string; rows: { slug: string; name: string; m: Map<string, number>; total: number }[]; p: ReturnType<typeof parseParams>; max: number }) {
  return (
    <>
      <tr className="bg-slate-50/70 dark:bg-slate-800/30">
        <td colSpan={METROS.length + 2} className="sticky left-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {family}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.slug} className={`border-b border-slate-50 last:border-0 dark:border-slate-800/60 ${p.cluster === r.slug ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}>
          <td className="sticky left-0 z-10 bg-white px-4 py-2 dark:bg-slate-900">
            <Link href={inventoryHref(p, { cluster: r.slug, metro: null })} className="font-medium text-slate-800 hover:text-teal-600 dark:text-slate-100">
              {r.name}
            </Link>
          </td>
          {METROS.map((m) => {
            const n = r.m.get(m) ?? 0;
            return (
              <td key={m} className="px-1 py-1 text-center">
                {n > 0 ? (
                  <Link href={inventoryHref(p, { cluster: r.slug, metro: m })} className={`block rounded-md px-2 py-1 tabular-nums ${shade(n, max)}`}>
                    {n}
                  </Link>
                ) : (
                  <span className={shade(0, max)}>·</span>
                )}
              </td>
            );
          })}
          <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.total}</td>
        </tr>
      ))}
    </>
  );
}
