import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import CandidatesSubNav from "../candidates/candidates-sub-nav";
import { PASSPORT_COLUMNS, segmentLabel, type PassportRow } from "@/lib/saas-passport";
import BenchTable, { type BenchRow } from "./bench-table";
import { evaluate, filtersFromRole, type RoleOption } from "@/lib/role-fit";
import RunMatching from "./run-matching";
import PoolList, { type PoolRow } from "./pool-list";
import SuggestedList from "./suggested-list";
import { suggestToCall, type RoleFitHint, type SuggestContext, type Tenure } from "@/lib/pool-suggest";
import TargetCompanies from "./target-companies";
import type { PoolEntry, PoolTier } from "@/lib/talent-pool";
import { POOL_PRACTICE } from "@/lib/talent-pool";

export const dynamic = "force-dynamic";

const LIVE_STAGES_EXCLUDED = new Set(["rejected", "pulled_back"]);

function countBy(values: (string | null | undefined)[]) {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

function BarList({ title, items, total }: { title: string; items: [string, number][]; total: number }) {
  return (
    <Card>
      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.length === 0 && <li className="text-[12.5px] text-slate-400">Nothing recorded yet.</li>}
        {items.slice(0, 7).map(([label, n]) => (
          <li key={label} className="text-[12.5px]">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>{label}</span>
              <span className="tabular-nums">{n}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-0.5">
              <div className="h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" style={{ width: `${Math.max(3, Math.round((n / Math.max(total, 1)) * 100))}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function SaasPracticePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const poolView = view === "pool";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) redirect("/candidates");

  // The whole B2B SaaS and tech bench (a few hundred rows), paged past the 1000-row cap.
  const all: PassportRow[] = [];
  for (let off = 0; off < 5000; off += 1000) {
    const { data } = await supabase
      .from("saas_passport")
      .select(PASSPORT_COLUMNS)
      .not("practice_fit", "is", null)
      .range(off, off + 999);
    all.push(...((data ?? []) as unknown as PassportRow[]));
    if (!data || data.length < 1000) break;
  }
  const benchIds = new Set(all.map((r) => r.candidate_id));

  const { data: roleRows } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, status, cities, city, experience_min, experience_max, budget_max, deal_size_band, sales_cycle")
    .eq("category", "b2b_sales")
    .in("status", ["open", "on_hold"])
    .order("status", { ascending: true });
  const roles = (roleRows ?? []) as {
    id: string;
    role_title: string | null;
    client_name: string | null;
    status: string;
    cities: string[] | null;
    city: string | null;
    experience_min: number | null;
    experience_max: number | null;
    budget_max: number | string | null;
    deal_size_band: string | null;
    sales_cycle: string | null;
  }[];
  const roleIds = roles.map((r) => r.id);

  type Match = { mandate_id: string; candidate_id: string; fit: string | null; status: string };
  type Link = { mandate_id: string; candidate_id: string; stage: string };
  const { data: matchRows } = roleIds.length
    ? await supabase.from("mandate_ai_matches").select("mandate_id, candidate_id, fit, status").in("mandate_id", roleIds).limit(5000)
    : { data: [] };
  const { data: linkRows } = roleIds.length
    ? await supabase.from("candidate_mandate_links").select("mandate_id, candidate_id, stage").in("mandate_id", roleIds).limit(5000)
    : { data: [] };
  const matches = (matchRows ?? []) as Match[];
  const links = (linkRows ?? []) as Link[];
  const liveLinks = links.filter((l) => !LIVE_STAGES_EXCLUDED.has(l.stage));
  const inPipeline = new Set(liveLinks.map((l) => l.candidate_id));
  const roleTitle = new Map(roles.map((r) => [r.id, r.role_title ?? "Role"]));

  // Strong suggestions still waiting for a person to decide, per candidate.
  const strongWaiting = matches.filter((m) => m.fit === "strong" && m.status === "suggested" && benchIds.has(m.candidate_id));
  const strongRolesByCandidate = new Map<string, string[]>();
  for (const m of strongWaiting) {
    const arr = strongRolesByCandidate.get(m.candidate_id) ?? [];
    arr.push(roleTitle.get(m.mandate_id) ?? "Role");
    strongRolesByCandidate.set(m.candidate_id, arr);
  }

  const total = all.length;
  const ready = all.filter((r) => r.readiness_tier === "ready").length;
  const passportOk = all.filter((r) => r.passport_score >= 70).length;
  const usedNow = Array.from(inPipeline).filter((id) => benchIds.has(id)).length;

  const segmentCounts = countBy(all.flatMap((r) => (r.segments ?? []).map(segmentLabel)));
  const segmentKeys = Array.from(new Set(all.flatMap((r) => r.segments ?? [])));
  const hunterCounts = countBy(all.map((r) => (r.hunter_farmer ? r.hunter_farmer.charAt(0).toUpperCase() + r.hunter_farmer.slice(1) : null)));
  const dealCounts = countBy(all.map((r) => r.deal_size));
  const cycleCounts = countBy(all.map((r) => r.sales_cycle));
  const gapCounts = countBy(all.flatMap((r) => r.passport_missing ?? []));

  const { data: staffRows } = await supabase.from("profiles").select("id, full_name, role").in("role", ["admin", "recruiter", "partner"]).order("full_name");
  const recruiters = ((staffRows ?? []) as { id: string; full_name: string | null }[])
    .filter((p) => !!p.full_name)
    .map((p) => ({ id: p.id, name: p.full_name as string }));

  // The Talent Pool: who has been marked, by whom, and why.
  const staffName = new Map(((staffRows ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const { data: poolRaw } = await supabase
    .from("talent_pool_entries")
    .select("candidate_id, tier, reason, tags, marked_by, marked_at")
    .eq("practice", POOL_PRACTICE)
    .limit(2000);
  const poolBy: Record<string, PoolEntry> = {};
  for (const e of (poolRaw ?? []) as { candidate_id: string; tier: PoolTier; reason: string | null; tags: string[] | null; marked_by: string | null; marked_at: string }[]) {
    poolBy[e.candidate_id] = { tier: e.tier, reason: e.reason, tags: e.tags ?? [], marked_by_name: e.marked_by ? staffName.get(e.marked_by) ?? null : null, marked_at: e.marked_at };
  }
  const poolIds = Object.keys(poolBy);

  // Candidates who already have an open "collect details" task.
  const { data: taskRows } = await supabase
    .from("recruiter_inbox")
    .select("candidate_id")
    .eq("task_type", "COLLECT_DETAILS")
    .in("status", ["open", "snoozed"])
    .limit(2000);
  const withTask = new Set(((taskRows ?? []) as { candidate_id: string | null }[]).map((t) => t.candidate_id).filter((v): v is string => !!v));

  // Who was already emailed in the last 30 days (the same window the sender uses to skip people).
  const lastAsked = new Map<string, string>();
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (skey) {
    const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, skey, { auth: { persistSession: false } });
    const since = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
    const { data: sentRows } = await admin
      .from("profile_outreach")
      .select("candidate_id, created_at")
      .eq("status", "sent")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(5000);
    for (const o of (sentRows ?? []) as { candidate_id: string; created_at: string }[]) {
      lastAsked.set(
        o.candidate_id,
        new Date(o.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })
      );
    }
  }

  // What each open B2B role asks for, and what is already known about each candidate for it.
  const roleOptions: RoleOption[] = roles.map((r) => ({
    id: r.id,
    title: r.role_title ?? "Role",
    client: r.client_name,
    status: r.status,
    cities: (r.cities && r.cities.length ? r.cities : r.city ? [r.city] : []).filter(Boolean),
    expMin: r.experience_min,
    expMax: r.experience_max,
    budgetMax: r.budget_max != null ? Number(r.budget_max) : null,
    dealBand: r.deal_size_band,
    cycle: r.sales_cycle,
  }));
  const matchesByRole: Record<string, Record<string, { fit: string; status: string }>> = {};
  for (const m of matches) {
    if (!m.fit || m.status === "dismissed") continue;
    (matchesByRole[m.mandate_id] ??= {})[m.candidate_id] = { fit: m.fit, status: m.status };
  }
  const stageByRole: Record<string, Record<string, string>> = {};
  for (const l of links) (stageByRole[l.mandate_id] ??= {})[l.candidate_id] = l.stage;
  const { data: relocRows } = await supabase
    .from("candidates")
    .select("id, open_to_relocation")
    .eq("profile_group", "b2b_sales")
    .not("open_to_relocation", "is", null)
    .limit(1000);
  const relocation: Record<string, string> = {};
  for (const c of (relocRows ?? []) as { id: string; open_to_relocation: string | null }[]) if (c.open_to_relocation) relocation[c.id] = c.open_to_relocation;

  const { data: listRows } = await supabase.rpc("candidate_lists_with_counts");
  const lists = ((listRows ?? []) as { id: string; name: string; n: number | string; owner_name: string | null }[]).map((l) => ({
    id: l.id,
    name: l.name,
    n: Number(l.n),
    owner_name: l.owner_name,
  }));

  let poolRows: PoolRow[] = [];
  if (poolView && poolIds.length > 0) {
    const have = new Map(all.map((r) => [r.candidate_id, r]));
    const missingIds = poolIds.filter((id) => !have.has(id));
    if (missingIds.length > 0) {
      const { data: extra } = await supabase.from("saas_passport").select(PASSPORT_COLUMNS).in("candidate_id", missingIds);
      for (const r of (extra ?? []) as unknown as PassportRow[]) have.set(r.candidate_id, r);
    }
    // Someone marked from the main candidate list may not be on the SaaS bench at all: show them from their profile.
    const stillMissing = poolIds.filter((id) => !have.has(id));
    if (stillMissing.length > 0) {
      const { data: plain } = await supabase
        .from("candidates")
        .select("id, full_name, current_employer, current_job_title, current_location, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, phone, email, resume_file_url")
        .in("id", stillMissing);
      for (const c of (plain ?? []) as Record<string, unknown>[]) {
        have.set(c.id as string, {
          candidate_id: c.id as string,
          full_name: (c.full_name as string | null) ?? null,
          current_employer: (c.current_employer as string | null) ?? null,
          current_job_title: (c.current_job_title as string | null) ?? null,
          city: (c.current_location as string | null) ?? null,
          total_experience_years: (c.total_experience_years as number | string | null) ?? null,
          current_fixed_ctc: (c.current_fixed_ctc as number | string | null) ?? null,
          expected_fixed_ctc: (c.expected_fixed_ctc as number | string | null) ?? null,
          notice_period: (c.notice_period as string | null) ?? null,
          notice_days_est: null,
          readiness_score: null,
          readiness_tier: null,
          sub_domain: null,
          status: null,
          practice_fit: null,
          segments: null,
          role_motion: null,
          hunter_farmer: null,
          deal_size: null,
          sales_cycle: null,
          quota: null,
          team_size: null,
          best_achievement: null,
          tools: null,
          confirmed_by_profile: null,
          passport_score: 0,
          passport_missing: null,
          cv_read: false,
          phone: (c.phone as string | null) ?? null,
          email: (c.email as string | null) ?? null,
          has_cv: !!c.resume_file_url,
          readiness_missing: null,
        } as PassportRow);
      }
    }
    // Last contact: the latest note, call or message with each person.
    const last = new Map<string, string>();
    const bump = (id: string | null, at: string | null) => {
      if (id && at && (!last.get(id) || at > (last.get(id) as string))) last.set(id, at);
    };
    const { data: acts } = await supabase.from("activities").select("entity_id, created_at").eq("entity_type", "candidate").in("entity_id", poolIds).order("created_at", { ascending: false }).limit(5000);
    for (const a of (acts ?? []) as { entity_id: string; created_at: string }[]) bump(a.entity_id, a.created_at);
    const { data: msgs } = await supabase.from("whatsapp_messages").select("candidate_id, created_at").in("candidate_id", poolIds).order("created_at", { ascending: false }).limit(5000);
    for (const m of (msgs ?? []) as { candidate_id: string | null; created_at: string }[]) bump(m.candidate_id, m.created_at);
    const now = new Date().getTime();
    poolRows = poolIds
      .map((id) => {
        const base = have.get(id);
        if (!base) return null;
        const at = last.get(id) ?? null;
        return {
          ...base,
          pool: poolBy[id],
          lastTouch: at ? new Date(at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : null,
          daysSinceTouch: at ? Math.floor((now - new Date(at).getTime()) / 86_400_000) : null,
        } as PoolRow;
      })
      .filter((r): r is PoolRow => r !== null);
  }
  // Who to call next: strongest on paper, fits a role open today, steady in jobs, not in the pool, no call logged yet.
  let suggestions: ReturnType<typeof suggestToCall> = [];
  let targetCompanies: string[] = [];
  if (poolView) {
    const { data: spoken } = await supabase.from("candidate_debriefs").select("candidate_id").limit(5000);
    const exclude = new Set<string>([...poolIds, ...((spoken ?? []) as { candidate_id: string }[]).map((d) => d.candidate_id)]);

    const { data: targetRow } = await supabase.from("talent_pool_settings").select("value").eq("key", "target_companies").maybeSingle();
    targetCompanies = Array.isArray(targetRow?.value) ? (targetRow.value as unknown[]).filter((x): x is string => typeof x === "string") : [];

    const { data: tenureRows } = await supabase.rpc("candidate_tenure_stats", { p_ids: all.map((r) => r.candidate_id) });
    const tenure = new Map<string, Tenure>();
    for (const t of (tenureRows ?? []) as { candidate_id: string; avg_tenure_years: number | string | null; short_stints: number; companies: string[] | null }[]) {
      tenure.set(t.candidate_id, { avg: t.avg_tenure_years != null ? Number(t.avg_tenure_years) : null, short: t.short_stints ?? 0, companies: t.companies ?? [] });
    }

    // Fit for roles open today: the AI's strong and possible matches, plus a plain rule check on city, experience and pay.
    const roleFit = new Map<string, RoleFitHint>();
    const hint = (id: string, boost: number, reason: string) => {
      const cur = roleFit.get(id);
      if (!cur) roleFit.set(id, { boost, reasons: [reason] });
      else {
        if (boost > cur.boost) cur.boost = boost;
        if (cur.reasons.length < 2) cur.reasons.push(reason);
      }
    };
    for (const m of matches) {
      if (m.status !== "suggested") continue;
      const title = roleTitle.get(m.mandate_id) ?? "an open role";
      if (m.fit === "strong") hint(m.candidate_id, 35, `Strong match for ${title}`);
      else if (m.fit === "possible") hint(m.candidate_id, 12, `Possible for ${title}`);
    }
    for (const ro of roleOptions.filter((x) => x.status === "open")) {
      const f = filtersFromRole(ro);
      for (const r of all) {
        const checks = evaluate(r, f, relocation[r.candidate_id] ?? null);
        if (checks.length >= 2 && checks.every((c) => c.state !== "fail") && checks.filter((c) => c.state === "unknown").length <= 1) hint(r.candidate_id, 20, `Fits ${ro.title} on paper`);
      }
    }

    const ctx: SuggestContext = { tenure, targets: targetCompanies.map((x) => x.toLowerCase()), roleFit };
    suggestions = suggestToCall(all, exclude, ctx, 12);
  }
  const poolCount = poolIds.length;
  const poolTop = Object.values(poolBy).filter((e) => e.tier === "top").length;
  const poolStrong = Object.values(poolBy).filter((e) => e.tier === "strong").length;
  const poolWatch = Object.values(poolBy).filter((e) => e.tier === "watch").length;
  const poolCold = poolRows.filter((r) => r.daysSinceTouch == null || r.daysSinceTouch >= 60).length;

  const tableRows: BenchRow[] = all.map((r) => ({
    ...r,
    strongRoles: strongRolesByCandidate.get(r.candidate_id) ?? [],
    openTask: withTask.has(r.candidate_id) ? "open" : null,
    lastAsked: lastAsked.get(r.candidate_id) ?? null,
  }));

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-6 space-y-8">
      <CandidatesSubNav />
      <div>
        <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">B2B SaaS and tech sales</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
          The practice at a glance: who you hold, what each person has actually sold, and which open roles they could fill. A candidate is counted here when their CV or profile shows software, SaaS or tech sales.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        <Link href="/saas-practice" className={`-mb-px border-b-2 px-4 py-2 text-[13.5px] font-medium ${!poolView ? "border-slate-900 text-slate-900 dark:border-white dark:text-white" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          Bench and roles <span className="ml-1 text-slate-400">{total}</span>
        </Link>
        <Link href="/saas-practice?view=pool" className={`-mb-px border-b-2 px-4 py-2 text-[13.5px] font-medium ${poolView ? "border-amber-500 text-slate-900 dark:text-white" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          Talent Pool <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[11.5px] font-semibold text-amber-900">{poolCount}</span>
        </Link>
      </div>

      {poolView ? (
        <div className="space-y-5">
          <p className="max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
            The people you would put in front of any client. Anyone on the team can add a person after a good conversation. Call the Top talent first when a role opens.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatTile label="In the pool" value={poolCount} />
            <StatTile label="Top talent" value={poolTop} accent />
            <StatTile label="Strong" value={poolStrong} />
            <StatTile label="Watch" value={poolWatch} />
            <StatTile label="Going cold (60+ days)" value={poolCold} />
          </div>
          <TargetCompanies initial={targetCompanies} canEdit={me.role === "admin"} />
          <SuggestedList items={suggestions} />
          <PoolList rows={poolRows} />
        </div>
      ) : (
        <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="On the bench" value={total} />
        <StatTile label="Ready to shortlist" value={ready} accent />
        <StatTile label="Passport 70%+" value={passportOk} />
        <StatTile label="In an open B2B pipeline" value={usedNow} />
        <StatTile label="Strong matches waiting" value={strongWaiting.length} />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Open B2B roles against the bench</h2>
          <RunMatching roles={roles.map((r) => ({ id: r.id, title: r.role_title ?? "Role" }))} />
        </div>
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">In pipeline</th>
                <th className="px-4 py-2.5 font-medium text-right">Strong, waiting</th>
                <th className="px-4 py-2.5 font-medium text-right">Possible, waiting</th>
                <th className="px-4 py-2.5 font-medium text-right">Checked</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No open B2B sales roles right now.</td>
                </tr>
              )}
              {roles.map((r) => {
                const ms = matches.filter((m) => m.mandate_id === r.id);
                const strong = ms.filter((m) => m.fit === "strong" && m.status === "suggested").length;
                const possible = ms.filter((m) => m.fit === "possible" && m.status === "suggested").length;
                const pipe = liveLinks.filter((l) => l.mandate_id === r.id).length;
                return (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/mandates/${r.id}`} className="font-medium text-blue-600 hover:underline">
                        {r.role_title ?? "Role"}
                      </Link>
                      {r.client_name && <span className="text-slate-500"> · {r.client_name}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.status === "open" ? "success" : "neutral"}>{r.status === "open" ? "Open" : "On hold"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pipe}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{strong}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{possible}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {ms.length > 0 ? ms.length : <span className="text-amber-600">never</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <p className="text-[12px] text-slate-400">
          &quot;Checked&quot; is how many bench candidates the AI has assessed for the role. Each press checks the next best batch, so press again for more.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">What the bench has sold</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <BarList title="Segment sold to" items={segmentCounts} total={total} />
          <BarList title="Typical deal size" items={dealCounts} total={total} />
          <BarList title="Sales cycle" items={cycleCounts} total={total} />
          <BarList title="Hunter or farmer" items={hunterCounts} total={total} />
        </div>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
          Most common gaps in passports:{" "}
          {gapCounts.length ? gapCounts.map(([g, n]) => `${g} (${n})`).join(", ") : "none"}. Fill these on calls to make more of the bench usable for any role.
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">The bench</h2>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Start with &quot;Needs details&quot;: pick the gap, select the people, and send them as tasks to the recruiter who will collect them. Read any CV without leaving the page.</p>
        </div>
        <BenchTable rows={tableRows} segmentOptions={segmentKeys} recruiters={recruiters} roles={roleOptions} matchesByRole={matchesByRole} stageByRole={stageByRole} relocation={relocation} lists={lists} waOpportunity={!!process.env.WHATSAPP_TEMPLATE_ROLE_OPPORTUNITY} pool={poolBy} />
      </section>
        </>
      )}
    </div>
  );
}
