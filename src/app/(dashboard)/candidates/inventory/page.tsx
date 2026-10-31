import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import RecalculateButton from "./recalculate-button";
import ClassifyButton from "./classify-button";
import { DOMAINS, LEVELS, METROS, SENIORITY_SHORT, TRACKS, inventoryHref, parseParams } from "@/lib/inventory";
import { POOL_TIER_LABEL, POOL_TIER_PILL, type PoolTier } from "@/lib/talent-pool";
import { GAP_LABEL } from "@/lib/completion";

export const dynamic = "force-dynamic";

type Cluster = { slug: string; name: string; track: string; family: string; sort_order: number };
type Cell = { cluster_slug: string; metro: string; n: number; ready: number };
type Demand = { cluster_slug: string; metro: string; open_roles: number; urgent_roles: number };
type RoleGap = { mandate_id: string; role_title: string | null; client_name: string | null; city: string | null; metro: string; role_cluster: string; is_urgent: boolean; total_n: number; ready_n: number; gate_missing_n: number; vitals_missing_n: number; reloc_ready_n: number; in_pipeline_n: number };
type Board = { mandate_id: string; candidate_id: string; full_name: string | null; title: string | null; employer: string | null; city: string | null; strength: string; pool_tier: PoolTier | null; in_pipeline: boolean; blockers: string[] | null };

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
  const [{ data: clusterRows }, { data: countRows }, { data: unclassifiedIds }, { data: demandRows }, { data: gapRows }, { data: boardRows }] = await Promise.all([
    supabase.from("role_clusters").select("slug, name, track, family, sort_order").order("sort_order"),
    supabase.rpc("supply_demand", { p_track: p.track, p_domain: p.domain, p_current_only: p.scope === "current", p_seniority: level.senior }),
    supabase.rpc("inventory_unclassified", { p_track: p.track }),
    supabase.rpc("open_roles_by_cell"),
    supabase.rpc("role_supply_gap"),
    supabase.rpc("role_call_board", { p_per_role: 5 }),
  ]);
  const clusters = (clusterRows ?? []) as Cluster[];
  const cells = (countRows ?? []) as Cell[];
  const demand = new Map(((demandRows ?? []) as Demand[]).map((d) => [`${d.cluster_slug}|${d.metro}`, d]));
  const clusterTrack = new Map(clusters.map((c) => [c.slug, c.track]));
  const clusterNameOf = new Map(clusters.map((c) => [c.slug, c.name]));
  const gaps = ((gapRows ?? []) as RoleGap[]).map((g) => ({ ...g, total_n: Number(g.total_n), ready_n: Number(g.ready_n), gate_missing_n: Number(g.gate_missing_n), vitals_missing_n: Number(g.vitals_missing_n), reloc_ready_n: Number(g.reloc_ready_n), in_pipeline_n: Number(g.in_pipeline_n) }));
  const board = new Map<string, Board[]>();
  for (const b of (boardRows ?? []) as Board[]) board.set(b.mandate_id, [...(board.get(b.mandate_id) ?? []), b]);

  // Supply we hold and have ready, with no open role for it: worth taking to clients.
  const pitch = cells
    .filter((c) => Number(c.ready) >= 5 && !demand.has(`${c.cluster_slug}|${c.metro}`) && c.metro !== "Unknown" && c.metro !== "Abroad")
    .sort((a, b) => Number(b.ready) - Number(a.ready))
    .slice(0, 6);

  const byCluster = new Map<string, Map<string, number>>();
  for (const c of cells) {
    const m = byCluster.get(c.cluster_slug) ?? new Map<string, number>();
    m.set(c.metro, Number(p.metric === "ready" ? c.ready : c.n));
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
  const poolBy = new Map<string, PoolTier>();
  if (people.length > 0) {
    const { data: pool } = await supabase.from("talent_pool_entries").select("candidate_id, tier").in("candidate_id", people.map((x) => x.candidate_id));
    for (const e of (pool ?? []) as { candidate_id: string; tier: PoolTier }[]) poolBy.set(e.candidate_id, e.tier);
  }

  const readyBy = new Map<string, { gaps: string[]; vgaps: string[]; strength: string }>();
  if (people.length > 0) {
    const { data: rd } = await supabase.rpc("people_readiness", { p_ids: people.map((x) => x.candidate_id) });
    for (const r of (rd ?? []) as { id: string; gaps: string[]; vgaps: string[]; strength: string }[]) readyBy.set(r.id, r);
  }
  const incompleteHere = people.filter((x) => (readyBy.get(x.candidate_id)?.vgaps.length ?? 1) > 0).length;

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-[12.5px] font-medium ${on ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`;
  const exportHref = p.cluster && p.cluster !== "none" ? `/api/inventory/export?${new URLSearchParams({ track: p.track, ...(p.domain ? { domain: p.domain } : {}), scope: p.scope, level: p.level, cluster: p.cluster, ...(p.metro ? { metro: p.metro } : {}) }).toString()}` : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6">
      <CandidatesSubNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Supply map</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
            What you hold against what is open: by kind of role and city, how many are ready to call and match today, and where open roles are short of ready people. Click a number to see the people behind it, or a button to fix the gap.
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

      {gaps.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Open roles: are we ready?</h2>
            <p className="text-[12.5px] text-slate-500">Urgent first, then the roles with the fewest ready people in their city. &quot;Ready&quot; means every vital is on file, so they can be called and matched today.</p>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {gaps.map((g) => {
              const track = clusterTrack.get(g.role_cluster) ?? p.track;
              const incomplete = g.total_n - g.ready_n;
              const fixHref = `/candidates/complete?${new URLSearchParams({ group: track, sub: "*", mode: g.gate_missing_n > 0 ? "gate" : "vitals", cluster: g.role_cluster, ...(g.metro !== "Unknown" ? { metro: g.metro } : {}) }).toString()}`;
              const tone = g.ready_n >= 10 ? "border-emerald-200 dark:border-emerald-900" : g.ready_n >= 4 ? "border-amber-200 dark:border-amber-900" : "border-rose-200 dark:border-rose-900";
              const firstCalls = board.get(g.mandate_id) ?? [];
              return (
                <li key={g.mandate_id} className={`rounded-ros-xl border bg-white p-4 dark:bg-slate-900 ${tone}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link target="_blank" rel="noopener noreferrer" href={`/mandates/${g.mandate_id}`} className="text-[14px] font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100">
                        {g.role_title ?? "Role"}
                      </Link>
                      {g.is_urgent && <span className="ml-2 rounded bg-orange-100 px-1.5 py-px text-[11px] font-semibold text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">Urgent</span>}
                      <p className="text-[12px] text-slate-500">{[g.client_name, g.city, clusterNameOf.get(g.role_cluster)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <p className="text-right text-[12px] text-slate-500"><b className="text-[20px] tabular-nums text-slate-900 dark:text-slate-100">{g.ready_n}</b> ready<br />of {g.total_n} in {g.metro === "Unknown" ? "the city" : g.metro}</p>
                  </div>
                  <p className="mt-2 text-[12.5px] text-slate-600 dark:text-slate-300">
                    {incomplete > 0 ? `${g.gate_missing_n} missing current pay or CV, ${g.vitals_missing_n} missing a vital.` : "Everyone we hold here has their vitals."}
                    {g.reloc_ready_n > 0 && ` ${g.reloc_ready_n} more ready people elsewhere would relocate.`} {g.in_pipeline_n} already in this role&apos;s pipeline.
                  </p>
                  {firstCalls.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {firstCalls.map((b) => (
                        <li key={b.candidate_id} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                          <Link target="_blank" rel="noopener noreferrer" href={`/candidates/${b.candidate_id}`} className="font-medium text-teal-700 hover:underline dark:text-teal-300">{b.full_name ?? "Unnamed"}</Link>
                          {b.pool_tier && <span className={`rounded-full px-1.5 text-[10.5px] font-semibold ring-1 ${POOL_TIER_PILL[b.pool_tier]}`}>{POOL_TIER_LABEL[b.pool_tier]}</span>}
                          <span className="text-slate-400">{b.strength}{b.in_pipeline ? " · in pipeline" : ""}</span>
                          <span className={(b.blockers ?? []).length === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                            {(b.blockers ?? []).length === 0 ? "ready to send" : `needs ${(b.blockers ?? []).length} to send`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {incomplete > 0 && (
                      <Link target="_blank" rel="noopener noreferrer" href={fixHref} className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[12px] font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
                        Complete these {incomplete}
                      </Link>
                    )}
                    <Link target="_blank" rel="noopener noreferrer" href={`/mandates/${g.mandate_id}`} className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                      Open the role
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pitch.length > 0 && (
        <section className="rounded-ros-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900 dark:bg-teal-950/20">
          <h2 className="text-[14px] font-semibold text-teal-900 dark:text-teal-100">Supply with no open role: take it to clients</h2>
          <p className="text-[12.5px] text-teal-900/80 dark:text-teal-200/80">Kinds of role we hold ready people for in a city where no mandate is open. These are the easiest conversations to start with a client.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pitch.map((c) => (
              <Link key={`${c.cluster_slug}|${c.metro}`} href={inventoryHref(p, { cluster: c.cluster_slug, metro: c.metro })} className="rounded-full bg-white px-3 py-1 text-[12.5px] font-medium text-slate-800 ring-1 ring-teal-200 hover:bg-teal-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-teal-800">
                {clusterNameOf.get(c.cluster_slug) ?? c.cluster_slug} · {c.metro} · <b>{Number(c.ready)}</b> ready
              </Link>
            ))}
          </div>
        </section>
      )}

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
        <div className="flex items-center gap-1">
          <Link href={inventoryHref(p, { metric: "ready", cluster: null, metro: null })} className={chip(p.metric === "ready")} title="Only people with every vital on file: they can be called and matched today">
            Ready people
          </Link>
          <Link href={inventoryHref(p, { metric: "all", cluster: null, metro: null })} className={chip(p.metric === "all")}>
            Everyone tagged
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
                <FamilyBlock key={f} family={f} rows={fr} p={p} max={max} demand={demand} />
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
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" /> an open role in that cell, <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" /> an urgent one, <b>0!</b> an open role with nobody ready. {" "}A person can appear in more than one row (for example someone who is both an Account Executive and a Solution Engineer), so totals are counts of roles, not people.{" "}
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
            {incompleteHere > 0 && p.cluster && p.cluster !== "none" && (
              <Link
                target="_blank"
                rel="noopener noreferrer"
                href={`/candidates/complete?${new URLSearchParams({ group: p.track, sub: "*", mode: "vitals", cluster: p.cluster, ...(p.metro ? { metro: p.metro } : {}) }).toString()}`}
                className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[12px] font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
              >
                Call the {incompleteHere} missing vitals
              </Link>
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
                  <th className="px-3 py-2 font-medium">Ready?</th>
                </tr>
              </thead>
              <tbody>
                {people.map((x) => {
                  const c = x.candidates;
                  const tier = poolBy.get(x.candidate_id);
                  return (
                    <tr key={x.candidate_id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                      <td className="px-4 py-2">
                        <Link target="_blank" rel="noopener noreferrer" href={`/candidates/${x.candidate_id}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
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
                      <td className="px-3 py-2">
                        {(() => {
                          const r = readyBy.get(x.candidate_id);
                          if (!r) return null;
                          return r.vgaps.length === 0 ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Ready</span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200" title={`Missing: ${r.vgaps.map((g) => GAP_LABEL[g] ?? g).join(", ")}`}>
                              {r.vgaps.length} missing
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
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

function FamilyBlock({ family, rows, p, max, demand }: { family: string; rows: { slug: string; name: string; m: Map<string, number>; total: number }[]; p: ReturnType<typeof parseParams>; max: number; demand: Map<string, Demand> }) {
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
            const d = demand.get(`${r.slug}|${m}`);
            const dot = d ? (
              <span className={`ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${d.urgent_roles > 0 ? "bg-rose-500" : "bg-amber-500"}`} title={`${d.open_roles} open ${d.open_roles === 1 ? "role" : "roles"} here${d.urgent_roles > 0 ? `, ${d.urgent_roles} urgent` : ""}`} />
            ) : null;
            return (
              <td key={m} className="px-1 py-1 text-center">
                {n > 0 ? (
                  <Link href={inventoryHref(p, { cluster: r.slug, metro: m })} className={`block rounded-md px-2 py-1 tabular-nums ${shade(n, max)}`}>
                    {n}
                    {dot}
                  </Link>
                ) : d ? (
                  <span className="block rounded-md bg-rose-50 px-2 py-1 text-[12px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" title={`${d.open_roles} open ${d.open_roles === 1 ? "role" : "roles"} here and nobody ready`}>0!</span>
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
