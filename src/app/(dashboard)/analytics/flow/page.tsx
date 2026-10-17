import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { stageLabel } from "@/lib/mandate-stage";
import { dismissReasonLabel } from "@/lib/ai-feedback";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import AiSwitchCard from "./ai-switch-card";

export const dynamic = "force-dynamic";

type Aging = { stage: string; ord: number; n: number; median_days: number | null; oldest_days: number | null; stuck: number };
type Cycle = { from_stage: string; to_stage: string; n: number; median_days: number | null; p75_days: number | null };
type Stuck = {
  link_id: string;
  candidate_id: string;
  candidate_name: string | null;
  mandate_id: string;
  role_title: string | null;
  stage: string;
  days: number;
  stuck_days: number;
  owner_name: string | null;
};
type Owner = { owner_name: string; active_n: number; stuck_n: number };
type Lost = { stage: string; n: number };
type Flow = { aging: Aging[]; cycle: Cycle[]; stuck: Stuck[]; by_owner: Owner[]; lost: Lost[]; events_since: string | null };

// Stages where the ball is with the client, not with us.
const CLIENT_SIDE = new Set(["submitted", "client_interview", "client_shortlisted", "offer"]);

function days(n: number | null | undefined) {
  return n == null ? "—" : `${n}d`;
}

export default async function FlowPage() {
  const supabase = await createClient();
  const { data: raw } = await supabase.rpc("flow_metrics");
  const flow: Flow = (raw as Flow | null) ?? { aging: [], cycle: [], stuck: [], by_owner: [], lost: [], events_since: null };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = url && key ? createSupabaseClient(url, key, { auth: { persistSession: false } }) : null;

  let paused = false;
  type UsageRow = { purpose: string; ok: boolean; input_tokens: number | null; output_tokens: number | null };
  let usage: UsageRow[] = [];
  let recent: { id: string; created_at: string; purpose: string; model: string | null; input_hash: string | null; ok: boolean; output_text: string | null }[] = [];
  if (admin) {
    const { data: cfg } = await admin.from("app_config").select("value").eq("key", "ai_paused").maybeSingle();
    paused = Boolean((cfg?.value as { paused?: boolean } | null)?.paused);
    const since = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
    const rows: UsageRow[] = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data } = await admin
        .from("ai_usage_log")
        .select("purpose, ok, input_tokens, output_tokens")
        .gte("created_at", since)
        .range(off, off + 999);
      rows.push(...((data ?? []) as UsageRow[]));
      if (!data || data.length < 1000) break;
    }
    usage = rows;
    const { data: rec } = await admin
      .from("ai_usage_log")
      .select("id, created_at, purpose, model, input_hash, ok, output_text")
      .not("output_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(6);
    recent = (rec ?? []) as typeof recent;
  }

  const byPurpose = new Map<string, { calls: number; failed: number; tokens: number }>();
  for (const r of usage) {
    const e = byPurpose.get(r.purpose) ?? { calls: 0, failed: 0, tokens: 0 };
    e.calls += 1;
    if (!r.ok) e.failed += 1;
    e.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
    byPurpose.set(r.purpose, e);
  }

  // Human decisions on AI suggestions, by the fit the AI gave, and how the
  // ones that were added went on to do.
  type MatchRow = { mandate_id: string; candidate_id: string; fit: string | null; status: string; dismissed_reason: string | null; dismissed_reason_codes: string[] | null };
  const matches = await fetchAllRows<MatchRow>(
    supabase,
    "mandate_ai_matches",
    "mandate_id, candidate_id, fit, status, dismissed_reason, dismissed_reason_codes"
  );
  const links = await fetchAllRows<{ mandate_id: string; candidate_id: string; stage: string }>(supabase, "candidate_mandate_links", "mandate_id, candidate_id, stage");
  const stageOf = new Map((links.data ?? []).map((l) => [`${l.mandate_id}:${l.candidate_id}`, l.stage]));
  const CLIENT_REACHED = new Set(["submitted", "client_interview", "client_shortlisted", "offer", "placed"]);
  const fitStats = new Map<string, { suggested: number; added: number; dismissed: number; reachedClient: number }>();
  const reasonCounts = new Map<string, number>();
  for (const m of matches.data ?? []) {
    const k = m.fit ?? "unrated";
    const e = fitStats.get(k) ?? { suggested: 0, added: 0, dismissed: 0, reachedClient: 0 };
    if (m.status === "added") {
      e.added += 1;
      if (CLIENT_REACHED.has(stageOf.get(`${m.mandate_id}:${m.candidate_id}`) ?? "")) e.reachedClient += 1;
    } else if (m.status === "dismissed") {
      e.dismissed += 1;
      const labels = m.dismissed_reason_codes?.length ? m.dismissed_reason_codes.map(dismissReasonLabel) : [m.dismissed_reason ?? "No reason given"];
      for (const l of labels) reasonCounts.set(l, (reasonCounts.get(l) ?? 0) + 1);
    } else e.suggested += 1;
    fitStats.set(k, e);
  }
  const topReasons = Array.from(reasonCounts.entries()).sort((x, y) => y[1] - x[1]).slice(0, 6);
  const fitOrder = ["strong", "possible", "weak", "unrated"];

  const totalActive = flow.aging.reduce((a, r) => a + r.n, 0);
  const totalStuck = flow.aging.reduce((a, r) => a + r.stuck, 0);
  const waitingOnClient = flow.aging.filter((r) => CLIENT_SIDE.has(r.stage)).reduce((a, r) => a + r.n, 0);
  const sinceLabel = flow.events_since ? new Date(flow.events_since).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null;

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-6 space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Pipeline flow</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            Open roles only. A candidate counts as stuck once they sit in a stage past its limit (sourced 14 days, screened 7, shortlisted 5, everything on the client side 7).
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="In active pipelines" value={totalActive} />
          <StatTile label="Stuck past limit" value={totalStuck} accent={totalStuck > 0} />
          <StatTile label="Waiting on the client" value={waitingOnClient} />
          <StatTile label="Stage changes tracked" value={flow.cycle.reduce((a, c) => a + c.n, 0)} />
        </div>

        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium text-right">Candidates</th>
                <th className="px-4 py-2.5 font-medium text-right">Typical wait</th>
                <th className="px-4 py-2.5 font-medium text-right">Longest wait</th>
                <th className="px-4 py-2.5 font-medium text-right">Stuck</th>
                <th className="px-4 py-2.5 font-medium">With</th>
              </tr>
            </thead>
            <tbody>
              {flow.aging.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No active pipeline candidates on open roles.</td>
                </tr>
              )}
              {flow.aging.map((r) => (
                <tr key={r.stage} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium capitalize text-slate-800 dark:text-slate-200">{stageLabel(r.stage)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.n}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{days(r.median_days)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{days(r.oldest_days)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.stuck > 0 ? <Badge tone="warning">{r.stuck}</Badge> : <span className="text-slate-400">0</span>}</td>
                  <td className="px-4 py-2.5 text-slate-500">{CLIENT_SIDE.has(r.stage) ? "Client" : "Our team"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Stuck now</h2>
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-2.5 font-medium">Candidate</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium text-right">Days in stage</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {flow.stuck.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">Nothing is past its limit.</td>
                </tr>
              )}
              {flow.stuck.map((s) => (
                <tr key={s.link_id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/candidates/${s.candidate_id}`} className="text-teal-600 hover:underline">
                      {s.candidate_name ?? "Unnamed"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/mandates/${s.mandate_id}`} className="hover:underline">
                      {s.role_title ?? "Role"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 capitalize">{stageLabel(s.stage)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {s.days}d <span className="text-slate-400">(limit {s.stuck_days})</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{s.owner_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Load by owner</h2>
          <Card padded={false}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium text-right">Active</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stuck</th>
                </tr>
              </thead>
              <tbody>
                {flow.by_owner.map((o) => (
                  <tr key={o.owner_name} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5">{o.owner_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{o.active_n}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{o.stuck_n}</td>
                  </tr>
                ))}
                {flow.by_owner.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">No data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Time between stages</h2>
          <Card padded={false}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Move</th>
                  <th className="px-4 py-2.5 font-medium text-right">Times</th>
                  <th className="px-4 py-2.5 font-medium text-right">Typical</th>
                  <th className="px-4 py-2.5 font-medium text-right">Slowest 25%</th>
                </tr>
              </thead>
              <tbody>
                {flow.cycle.slice(0, 12).map((c) => (
                  <tr key={`${c.from_stage}-${c.to_stage}`} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5 capitalize">
                      {stageLabel(c.from_stage)} → {stageLabel(c.to_stage)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.n}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{days(c.median_days)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{days(c.p75_days)}</td>
                  </tr>
                ))}
                {flow.cycle.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">No stage changes recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          {sinceLabel && <p className="text-[12px] text-slate-400">Stage changes have been recorded since {sinceLabel}; older movements are not included, so treat small counts as indicative.</p>}
        </div>
      </section>

      {flow.lost.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Where candidates are lost</h2>
          <div className="flex flex-wrap gap-2">
            {flow.lost.map((l) => (
              <Badge key={l.stage} tone="neutral">
                <span className="capitalize">{stageLabel(l.stage)}</span>: {l.n}
              </Badge>
            ))}
          </div>
          <p className="text-[12px] text-slate-400">The stage a candidate was in when they were rejected. Reasons are on the Reports tab.</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">AI controls and accountability</h2>
        <AiSwitchCard initialPaused={paused} />

        <div className="grid md:grid-cols-2 gap-6">
          <Card padded={false}>
            <p className="px-4 pt-3 pb-1 text-[13px] font-medium text-slate-800 dark:text-slate-200">AI use, last 30 days</p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2 font-medium">Task</th>
                  <th className="px-4 py-2 font-medium text-right">Calls</th>
                  <th className="px-4 py-2 font-medium text-right">Failed</th>
                  <th className="px-4 py-2 font-medium text-right">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byPurpose.entries()).map(([p, e]) => (
                  <tr key={p} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                    <td className="px-4 py-2">{p.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.calls}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.failed}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.tokens.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
                {byPurpose.size === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center text-slate-500">No AI calls in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card padded={false}>
            <p className="px-4 pt-3 pb-1 text-[13px] font-medium text-slate-800 dark:text-slate-200">Was the AI right?</p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2 font-medium">AI rated</th>
                  <th className="px-4 py-2 font-medium text-right">Added</th>
                  <th className="px-4 py-2 font-medium text-right">Dismissed</th>
                  <th className="px-4 py-2 font-medium text-right">Agreed</th>
                  <th className="px-4 py-2 font-medium text-right">Reached client</th>
                  <th className="px-4 py-2 font-medium text-right">Undecided</th>
                </tr>
              </thead>
              <tbody>
                {fitOrder
                  .filter((f) => fitStats.has(f))
                  .map((f) => {
                    const e = fitStats.get(f)!;
                    const decided = e.added + e.dismissed;
                    return (
                      <tr key={f} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-4 py-2 capitalize">{f}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{e.added}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{e.dismissed}</td>
                        <td className="px-4 py-2 text-right tabular-nums" title={decided < 5 ? "Too few decisions to read anything into yet" : undefined}>
                          {decided < 5 ? <span className="text-slate-400">too few</span> : `${Math.round((e.added / decided) * 100)}%`}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{e.reachedClient}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{e.suggested}</td>
                      </tr>
                    );
                  })}
                {fitStats.size === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-5 text-center text-slate-500">No suggestions yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {topReasons.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Why suggestions were dismissed</p>
                <div className="flex flex-wrap gap-1.5">
                  {topReasons.map(([label, n]) => (
                    <Badge key={label} tone="neutral">
                      {label}: {n}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <p className="px-4 py-2 text-[12px] text-slate-400">
              &quot;Agreed&quot; is the share of decided suggestions that people added. It shows once there are 5 decisions per rating, so &quot;strong&quot; can be checked against real choices.
            </p>
          </Card>
        </div>

        <Card padded={false}>
          <p className="px-4 pt-3 pb-1 text-[13px] font-medium text-slate-800 dark:text-slate-200">Latest AI outputs on record</p>
          <p className="px-4 pb-2 text-[12px] text-slate-400">
            Each call stores a fingerprint of its input and the answer it returned (CV reading stores only the fingerprint, not the CV). Use this to trace why a suggestion appeared.
          </p>
          <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
            {recent.map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-2 text-slate-500">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{r.purpose.replace(/_/g, " ")}</span>
                  <span>{new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  <span>{r.model ?? "—"}</span>
                  <span className="font-mono">{r.input_hash ?? "—"}</span>
                  {!r.ok && <Badge tone="warning">failed</Badge>}
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400 line-clamp-2">{r.output_text}</p>
              </li>
            ))}
            {recent.length === 0 && <li className="px-4 py-5 text-center text-[13px] text-slate-500">Outputs will appear here after the next matching run.</li>}
          </ul>
        </Card>
      </section>
    </div>
  );
}
