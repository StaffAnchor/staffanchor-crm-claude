import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import CallsDesk, { type CallPerson } from "../calls/calls-desk";
import { GAP_LABEL, STRENGTH } from "@/lib/completion";
import TargetControl, { type Target } from "./target-control";

export const dynamic = "force-dynamic";

// Profile completion: for every group and practice, how many profiles have everything needed to present a candidate and how
// many are still to go, by city and by what is missing, with a deadline per practice and a call list to finish them.

type Row = { profile_group: string; bucket: string; total: number; complete: number; incomplete: number; no_phone: number; assessed: number; gaps: Record<string, number>; strengths: Record<string, number> };
type City = { city: string; total: number; complete: number; incomplete: number };

const GROUPS = [
  { key: "b2b_sales", label: "B2B Sales", note: "First priority" },
  { key: "b2c_sales", label: "B2C Sales", note: "Second priority" },
  { key: "non_sales", label: "Non-Sales", note: "Functions" },
  { key: "unclear", label: "Needs a look", note: "Domain not decided" },
] as const;
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label])) as Record<string, string>;
const BY = [
  { key: "sub_group", label: "Practice" },
  { key: "sub_domain", label: "Specialization" },
] as const;

const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const n0 = (n: number) => n.toLocaleString("en-IN");
function StrengthBar({ s, total }: { s: Record<string, number>; total: number }) {
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Profile strength split">
        {(["strong", "good", "weak", "poor", "unrated"] as const).map((k) => (s[k] ? <div key={k} className={STRENGTH[k].bar} style={{ width: `${(s[k] / Math.max(1, total)) * 100}%` }} title={`${STRENGTH[k].label}: ${s[k]}`} /> : null))}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-2.5 text-[11px] text-slate-500">
        {(["strong", "good", "weak", "poor", "unrated"] as const).map((k) => (s[k] ? <span key={k}><b className="tabular-nums text-slate-700 dark:text-slate-200">{s[k]}</b> {STRENGTH[k].label.toLowerCase()}</span> : null))}
      </p>
    </div>
  );
}
const bucketLabel = (b: string) => (b === "(not set)" ? "Not set yet" : b);

function Bar({ done, total, tone = "bg-teal-500" }: { done: number; total: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${pct(done, total)}% complete`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct(done, total)}%` }} />
    </div>
  );
}

export default async function CompletionPage({ searchParams }: { searchParams: Promise<{ group?: string; by?: string; sub?: string; city?: string; gap?: string; strength?: string; mode?: string }> }) {
  const sp = await searchParams;
  const group = GROUPS.some((g) => g.key === sp.group) ? (sp.group as string) : "b2b_sales";
  const by = sp.by === "sub_domain" ? "sub_domain" : "sub_group";
  const sub = sp.sub ?? null; // a bucket name, or "*" for the whole group
  const city = sp.city ?? null;
  const gap = sp.gap && GAP_LABEL[sp.gap] ? sp.gap : null;
  const strength = sp.strength && STRENGTH[sp.strength] ? sp.strength : null;
  const mode = sp.mode === "assess" ? "assess" : "complete";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) redirect("/today");

  const [{ data: overview }, { data: targetRows }] = await Promise.all([
    supabase.rpc("completion_overview", { p_by: by }),
    supabase.from("completion_targets").select("profile_group, by_field, bucket, due_on, baseline_incomplete").eq("by_field", by),
  ]);
  const rows = ((overview ?? []) as Row[]).map((r) => ({ ...r, gaps: r.gaps ?? {}, strengths: r.strengths ?? {} }));
  const targets = new Map<string, Target>();
  for (const t of (targetRows ?? []) as (Target & { profile_group: string; bucket: string })[]) targets.set(`${t.profile_group}|${t.bucket}`, t);

  const sum = (rs: Row[]) => rs.reduce((a, r) => ({ total: a.total + r.total, complete: a.complete + r.complete, incomplete: a.incomplete + r.incomplete, no_phone: a.no_phone + r.no_phone, assessed: a.assessed + r.assessed }), { total: 0, complete: 0, incomplete: 0, no_phone: 0, assessed: 0 });
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g.key, sum(rows.filter((r) => r.profile_group === g.key))])) as Record<string, ReturnType<typeof sum>>;
  const grand = sum(rows);
  const groupRows = rows.filter((r) => r.profile_group === group).sort((a, b) => b.incomplete - a.incomplete);
  const groupGaps: Record<string, number> = {};
  for (const r of groupRows) for (const [k, v] of Object.entries(r.gaps)) groupGaps[k] = (groupGaps[k] ?? 0) + v;
  const addStrengths = (rs: Row[]) => rs.reduce<Record<string, number>>((a, r) => { for (const [k, v] of Object.entries(r.strengths)) a[k] = (a[k] ?? 0) + v; return a; }, {});
  const groupStrengths = Object.fromEntries(GROUPS.map((g) => [g.key, addStrengths(rows.filter((r) => r.profile_group === g.key))])) as Record<string, Record<string, number>>;

  const url = (o: Partial<{ group: string; by: string; sub: string | null; city: string | null; gap: string | null; strength: string | null; mode: string }>) => {
    const q = new URLSearchParams();
    const g = o.group ?? group;
    q.set("group", g);
    const b = o.by ?? by;
    if (b !== "sub_group") q.set("by", b);
    const s = "sub" in o ? o.sub : sub;
    if (s) q.set("sub", s);
    const c = "city" in o ? o.city : city;
    if (c) q.set("city", c);
    const ga = "gap" in o ? o.gap : gap;
    if (ga) q.set("gap", ga);
    const st = "strength" in o ? o.strength : strength;
    if (st) q.set("strength", st);
    const m = o.mode ?? mode;
    if (m !== "complete") q.set("mode", m);
    return `/candidates/complete?${q.toString()}`;
  };

  const working = sub !== null;
  const bucketKey = sub && sub !== "*" ? sub : null;
  const focusRow = working ? (bucketKey ? groupRows.find((r) => r.bucket === bucketKey) : { ...sum(groupRows), profile_group: group, bucket: "*", gaps: groupGaps, strengths: groupStrengths[group] ?? {} }) : null;

  // Cities: inside the chosen practice when working, otherwise across the whole group.
  const { data: cityData } = await supabase.rpc("completion_cities", { p_group: group, p_by: by, p_bucket: bucketKey });
  const cities = ((cityData ?? []) as City[]).filter((c) => c.incomplete > 0).sort((a, b) => b.incomplete - a.incomplete).slice(0, 14);

  let people: CallPerson[] = [];
  let queueError: string | null = null;
  if (working && focusRow && (mode === "assess" ? focusRow.total - focusRow.assessed > 0 : focusRow.incomplete > 0)) {
    const { data: queue, error } = await supabase.rpc("completion_queue", { p_group: group, p_by: by, p_bucket: bucketKey, p_city: city, p_gap: gap, p_strength: strength, p_mode: mode, p_limit: 50 });
    if (error) queueError = error.message;
    const q = (queue ?? []) as { id: string; gaps: string[]; strength: string; why: string[] }[];
    if (q.length > 0) {
      const ids = q.map((x) => x.id);
      const [{ data: callRows }, { data: extra }] = await Promise.all([
        supabase.rpc("calls_for_candidates", { p_ids: ids }),
        supabase.from("candidates").select("id, email, profile_group, sub_domain").in("id", ids),
      ]);
      const ex = new Map(((extra ?? []) as { id: string; email: string | null; profile_group: string | null; sub_domain: string | null }[]).map((e) => [e.id, e]));
      const gapsOf = new Map(q.map((x) => [x.id, x.gaps]));
      const strOf = new Map(q.map((x) => [x.id, x]));
      const byId = new Map(((callRows ?? []) as CallPerson[]).map((p) => [p.id, p]));
      people = ids
        .map((id) => byId.get(id))
        .filter((p): p is CallPerson => !!p)
        .map((p) => ({ ...p, resume_url: null, reason: "details_missing" as const, gaps: gapsOf.get(p.id) ?? [], strength: strOf.get(p.id)?.strength, why: strOf.get(p.id)?.why ?? [], email: ex.get(p.id)?.email ?? null, profile_group: ex.get(p.id)?.profile_group ?? null, sub_domain: ex.get(p.id)?.sub_domain ?? null }));
    }
  }

  const focusGapEntries = focusRow ? Object.entries(focusRow.gaps).sort((a, b) => b[1] - a[1]) : [];
  const focusTarget = focusRow ? targets.get(`${group}|${focusRow.bucket}`) ?? null : null;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 max-md:px-3">
      <CandidatesSubNav />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Profile completion</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
            A profile is complete when it has everything needed to present the person to a client: name, phone, email, CV, experience, current and expected pay, notice period,
            city, relocation, domain, sub-domain, role level, company and job title. Incomplete profiles are held back from matching, so finishing them puts more people in front of every role.
          </p>
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          <span className="text-slate-500">Group practices by</span>
          {BY.map((b) => (
            <Link key={b.key} href={url({ by: b.key, sub: null })} className={`rounded-full border px-3 py-1 font-medium ${by === b.key ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
              {b.label}
            </Link>
          ))}
        </div>
      </div>

      {/* The whole base, split by group. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map((g) => {
          const s = byGroup[g.key];
          const on = g.key === group;
          if (g.key === "unclear" && s.total === 0) return null;
          return (
            <Link key={g.key} href={url({ group: g.key, sub: null, city: null, gap: null })} className={`${card} block p-4 transition hover:shadow-sm ${on ? "ring-2 ring-slate-900/70 dark:ring-slate-100/70" : ""}`}>
              <p className="flex items-baseline justify-between text-[12px] text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{g.label}</span>
                <span>{g.note}</span>
              </p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-[28px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{n0(s.total)}</span>
                <span className="text-[12px] text-slate-500">{grand.total > 0 ? `${pct(s.total, grand.total)}% of ${n0(grand.total)} profiles` : "profiles"}</span>
              </p>
              <div className="mt-3"><Bar done={s.complete} total={s.total} tone={s.complete === s.total ? "bg-emerald-500" : "bg-teal-500"} /></div>
              <p className="mt-1.5 flex justify-between text-[12.5px]">
                <span className="text-emerald-700 dark:text-emerald-300">{n0(s.complete)} complete</span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">{n0(s.incomplete)} to go</span>
              </p>
              <p className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Profile strength · {n0(s.assessed)} judged on a call</p>
              <StrengthBar s={groupStrengths[g.key] ?? {}} total={s.total} />
            </Link>
          );
        })}
      </div>

      {!working ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{GROUP_LABEL[group]}: {n0(byGroup[group].incomplete)} profiles still to complete</h2>
              {byGroup[group].incomplete > 0 && (
                <Link href={url({ sub: "*" })} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700">
                  Work on all of {GROUP_LABEL[group]} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            {groupRows.length === 0 ? (
              <p className={`${card} p-6 text-[14px] text-slate-500`}>No profiles in this group yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {groupRows.map((r) => {
                  const top = Object.entries(r.gaps).sort((a, b) => b[1] - a[1]).slice(0, 4);
                  const target = targets.get(`${group}|${r.bucket}`) ?? null;
                  return (
                    <li key={r.bucket} className={`${card} p-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                        <div className="min-w-0 flex-1 basis-64">
                          <p className="text-[14.5px] font-semibold text-slate-900 dark:text-slate-100">{bucketLabel(r.bucket)}</p>
                          <p className="mt-0.5 text-[12.5px] text-slate-500">
                            {n0(r.total)} profiles · <span className="text-emerald-700 dark:text-emerald-300">{n0(r.complete)} complete</span> · <b className="text-amber-700 dark:text-amber-300">{n0(r.incomplete)} to go</b>
                            {r.no_phone > 0 && <span> · {r.no_phone} have no usable phone</span>}
                          </p>
                          <div className="mt-2"><Bar done={r.complete} total={r.total} tone={r.incomplete === 0 ? "bg-emerald-500" : "bg-teal-500"} /></div>
                          <div className="mt-2.5 max-w-xl">
                            <StrengthBar s={r.strengths} total={r.total} />
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {r.assessed} of {r.total} judged on a call
                              {r.total - r.assessed > 0 && <> · <Link href={url({ sub: r.bucket, mode: "assess" })} className="font-medium text-teal-700 hover:underline dark:text-teal-300">assess the rest</Link></>}
                            </p>
                          </div>
                          {top.length > 0 && (
                            <p className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
                              {top.map(([k, v]) => (
                                <Link key={k} href={url({ sub: r.bucket, gap: k })} className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                                  {GAP_LABEL[k] ?? k} · {v}
                                </Link>
                              ))}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          {r.incomplete > 0 && <TargetControl group={group} by={by} bucket={r.bucket} incomplete={r.incomplete} target={target} compact />}
                          {r.incomplete > 0 ? (
                            <Link href={url({ sub: r.bucket })} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
                              Start calling <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">All complete</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="space-y-4">
            <section className={`${card} p-4`}>
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Where the gaps are in {GROUP_LABEL[group]}</h3>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(groupGaps).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li key={k}>
                    <Link href={url({ sub: "*", gap: k })} className="flex items-center justify-between gap-2 text-[12.5px] hover:underline">
                      <span className="text-slate-600 dark:text-slate-300">Missing {GAP_LABEL[k] ?? k}</span>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{n0(v)}</span>
                    </Link>
                  </li>
                ))}
                {Object.keys(groupGaps).length === 0 && <li className="text-[12.5px] text-slate-500">Nothing missing.</li>}
              </ul>
            </section>
            <section className={`${card} p-4`}>
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Incomplete profiles by city</h3>
              <p className="text-[11.5px] text-slate-500">They cannot come up in matching for a role in that city until completed.</p>
              <ul className="mt-2 space-y-1.5">
                {cities.map((c) => (
                  <li key={c.city}>
                    <Link href={url({ sub: "*", city: c.city })} className="block hover:opacity-80">
                      <span className="flex items-center justify-between text-[12.5px]">
                        <span className="text-slate-700 dark:text-slate-200">{c.city}</span>
                        <span className="text-slate-500"><b className="text-slate-900 dark:text-slate-100">{c.incomplete}</b> of {c.total}</span>
                      </span>
                      <Bar done={c.complete} total={c.total} />
                    </Link>
                  </li>
                ))}
                {cities.length === 0 && <li className="text-[12.5px] text-slate-500">No incomplete profiles.</li>}
              </ul>
            </section>
          </aside>
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <Link href={url({ sub: null, city: null, gap: null })} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-teal-700 hover:underline dark:text-teal-300">
              <ArrowLeft className="h-3.5 w-3.5" /> All {GROUP_LABEL[group]} practices
            </Link>
          </div>
          {focusRow && (
            <div className={`${card} mb-4 p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 basis-72">
                  <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">
                    {GROUP_LABEL[group]} › {bucketKey ? bucketLabel(bucketKey) : "all practices"}
                    {city ? ` › ${city}` : ""}
                    {gap ? ` › missing ${GAP_LABEL[gap]}` : ""}
                    {strength ? ` › ${STRENGTH[strength].label.toLowerCase()} profiles` : ""}
                  </h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    {n0(focusRow.total)} profiles · <span className="text-emerald-700 dark:text-emerald-300">{n0(focusRow.complete)} complete</span> · <b className="text-amber-700 dark:text-amber-300">{n0(focusRow.incomplete)} to go</b>
                    {focusRow.no_phone > 0 && ` · ${focusRow.no_phone} have no usable phone (they need their number first)`}
                  </p>
                  <div className="mt-2 max-w-xl"><Bar done={focusRow.complete} total={focusRow.total} /></div>
                </div>
                {bucketKey && focusRow.incomplete > 0 && <TargetControl group={group} by={by} bucket={bucketKey} incomplete={focusRow.incomplete} target={focusTarget} />}
              </div>
              <div className="mt-3 max-w-xl"><StrengthBar s={focusRow.strengths} total={focusRow.total} /></div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">Call list:</span>
                {([{ k: "complete", l: "Fill the gaps", n: focusRow.incomplete }, { k: "assess", l: "Judge on a call", n: focusRow.total - focusRow.assessed }] as const).map((m) => (
                  <Link key={m.k} href={url({ mode: m.k })} className={`rounded-full border px-3 py-0.5 font-medium ${mode === m.k ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                    {m.l} · {n0(m.n)}
                  </Link>
                ))}
                <span className="text-slate-400">{mode === "assess" ? "Nobody has rated their communication yet. Rate it on the call; strength follows." : "Fewest gaps first, so profiles reach complete."}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">Strength:</span>
                <Link href={url({ strength: null })} className={`rounded-full border px-2.5 py-0.5 font-medium ${!strength ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>Any</Link>
                {(["strong", "good", "weak", "poor", "unrated"] as const).map((k) => (
                  <Link key={k} href={url({ strength: k })} className={`rounded-full border px-2.5 py-0.5 font-medium ${strength === k ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                    {STRENGTH[k].label} · {focusRow.strengths[k] ?? 0}
                  </Link>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">Only people missing:</span>
                <Link href={url({ gap: null })} className={`rounded-full border px-2.5 py-0.5 font-medium ${!gap ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>Anything</Link>
                {focusGapEntries.map(([k, v]) => (
                  <Link key={k} href={url({ gap: k })} className={`rounded-full border px-2.5 py-0.5 font-medium ${gap === k ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                    {GAP_LABEL[k] ?? k} · {v}
                  </Link>
                ))}
              </div>
              {cities.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="font-medium text-slate-500">City:</span>
                  <Link href={url({ city: null })} className={`rounded-full border px-2.5 py-0.5 font-medium ${!city ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>All cities</Link>
                  {cities.map((c) => (
                    <Link key={c.city} href={url({ city: c.city })} className={`rounded-full border px-2.5 py-0.5 font-medium ${city === c.city ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                      {c.city} · {c.incomplete}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          {queueError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">Couldn&apos;t load the list: {queueError}</p>
          ) : (
            <>
              <p className="mb-3 text-[12.5px] text-slate-500">
                The {people.length} people who can be called now{mode === "assess" ? ", strongest on paper first" : ", fewest gaps first so profiles actually reach complete"}. Call, fill in what is missing, rate how they came across, pick the result; the next person opens by itself.
                People who didn&apos;t answer come back after a day, up to 3 tries.
              </p>
              <CallsDesk key={`${group}|${by}|${sub}|${city}|${gap}`} people={people} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
