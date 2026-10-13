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
import type { RoleOption } from "@/lib/role-fit";
import RunMatching from "./run-matching";

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

export default async function SaasPracticePage() {
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
        <BenchTable rows={tableRows} segmentOptions={segmentKeys} recruiters={recruiters} roles={roleOptions} matchesByRole={matchesByRole} stageByRole={stageByRole} relocation={relocation} />
      </section>
    </div>
  );
}
