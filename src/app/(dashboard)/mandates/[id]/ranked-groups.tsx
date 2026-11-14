"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, MessageCircle, Phone, PhoneCall, UserPlus } from "lucide-react";
import { CvButtons } from "@/components/candidate-card-layout";
import { SkillsStrip } from "@/components/candidate-facts-strip";
import CandidateCallPanel from "./candidate-call-panel";
import { FactTile, NextStep, ScoreRing } from "@/components/pipeline-ui";
import NotAFitMenu from "./not-a-fit-menu";
import PipelineTemplateActions from "./pipeline-template-actions";
import WriteWhatsAppButton from "./write-whatsapp-button";
import WhatsAppReview from "@/components/whatsapp-review";
import { useWhatsAppTemplates } from "@/lib/use-whatsapp-templates";
import { POOL_TIER_LABEL, POOL_TIER_PILL, type PoolTier } from "@/lib/talent-pool";
import type { Ranked } from "@/lib/role-match";

const GROUPS: { key: Ranked["bucket"]; label: string; blurb: string; tone: string }[] = [
  { key: "perfect", label: "Perfect", blurb: "Does this job today, sells the right thing, and city, pay and experience all line up.", tone: "bg-emerald-600" },
  { key: "close", label: "Close", blurb: "Nothing important is off. A nearby city, a little over on pay or experience, or pay still to confirm on a call.", tone: "bg-teal-600" },
  { key: "stretch", label: "Stretch", blurb: "More is different, but worth a look.", tone: "bg-slate-500" },
];

const PER_PAGE = 15;

const MISSING_LABEL: Record<string, string> = { current_ctc: "current pay", expected_ctc: "expected pay", notice: "notice period", industries: "industries", cv_unread: "CV not read", current_employer: "company", relocation: "relocation", city: "city" };
const missingText = (m: string[] | null | undefined) => (m ?? []).slice(0, 3).map((k) => MISSING_LABEL[k] ?? k.replace(/_/g, " ")).join(", ");

const REACHED_LABEL: Record<string, string> = { sent: "Messaged", interested: "Said yes", not_now: "Not now" };
const REACHED_STYLE: Record<string, string> = {
  sent: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  interested: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  not_now: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

type Where = "all" | "here" | "reloc" | "unknown";
const RELOC_OK = new Set(["Yes", "Maybe", "Depends upon Option"]);

export default function RankedGroups({ mandateId, roleTitle = null, roleCluster = null, ranked: allRanked, reached = {}, cities = [], memory = {} }: { mandateId: string; roleTitle?: string | null; roleCluster?: string | null; ranked: Ranked[]; reached?: Record<string, { status: string; at: string }>; cities?: string[]; memory?: Record<string, { at: string; summary: string; wants?: string[]; dealbreakers?: string[] }> }) {
  const router = useRouter();
  const flags = useWhatsAppTemplates();
  const [reviewing, setReviewing] = useState(false);
  // Where they are, for a role tied to a city: in the city, elsewhere but open to moving, or elsewhere with no answer yet.
  const [where, setWhere] = useState<Where>("all");
  const placeOf = (r: Ranked): Exclude<Where, "all"> => (r.metro && cities.includes(r.metro) ? "here" : RELOC_OK.has(r.row.open_to_relocation ?? "") ? "reloc" : "unknown");
  const whereCounts = useMemo(() => {
    const n = { here: 0, reloc: 0, unknown: 0 };
    for (const r of allRanked) n[placeOf(r)]++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRanked, cities]);
  const ranked = useMemo(
    () => (where === "all" ? allRanked : allRanked.filter((r) => placeOf(r) === where)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRanked, where, cities]
  );
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.key, ranked.filter((r) => r.bucket === g.key).length])) as Record<Ranked["bucket"], number>, [ranked]);
  const first = (GROUPS.find((g) => counts[g.key] > 0) ?? GROUPS[0]).key;
  const [tab, setTab] = useState<Ranked["bucket"]>(first);
  const [shown, setShown] = useState(PER_PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [paneTab, setPaneTab] = useState<"overview" | "call">("overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  async function dismiss(candidateId: string, reason: string) {
    if (!reason) return;
    setGone((g) => new Set(g).add(candidateId));
    const res = await fetch(`/api/mandates/${mandateId}/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate_id: candidateId, reason }) });
    if (!res.ok) {
      setGone((g) => new Set([...g].filter((x) => x !== candidateId)));
      setMsg("Couldn't save that reason, so the person was not removed. Try again.");
    }
  }

  // Local people come first within a group when the role is tied to a city; otherwise the order is the score.
  const list = ranked
    .filter((r) => r.bucket === tab && !gone.has(r.row.candidate_id))
    .sort((a, b) => (cities.length ? Number(placeOf(b) === "here") - Number(placeOf(a) === "here") : 0) || b.score - a.score);

  const addPicked = () => addList(ranked.filter((r) => picked.has(r.row.candidate_id)));
  async function addList(chosen: Ranked[]) {
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/role-card/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: chosen.map((r) => ({ id: r.row.candidate_id, score: r.score, note: r.matched.slice(0, 3).join("; ") })) }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Added ${d.added} to the pipeline.` : d.error ?? "Couldn't add.");
      setPicked((p) => new Set([...p].filter((id) => !chosen.some((r) => r.row.candidate_id === id))));
      if (res.ok) setGone((g) => new Set([...g, ...chosen.map((r) => r.row.candidate_id)]));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // The best people nobody has messaged about this role yet: the Perfect group, up to 15.
  const readyToReach = ranked.filter((r) => r.bucket === "perfect" && !reached[r.row.candidate_id]).slice(0, 15);
  const selectReady = () => {
    setTab("perfect");
    setPicked(new Set(readyToReach.map((r) => r.row.candidate_id)));
  };
  const reachIds = ranked.filter((r) => picked.has(r.row.candidate_id)).map((r) => r.row.candidate_id);
  const post = (body: Record<string, unknown>) =>
    fetch("/api/whatsapp/role-opportunity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mandateId, candidateIds: reachIds, ...body }) }).then(async (r) => ({ res: r, d: await r.json().catch(() => ({})) }));

  const fmtShort = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "earlier");
  const factsOf = (r: Ranked) => {
    const c = r.row;
    return [
      c.total_experience_years != null ? `${Number(c.total_experience_years)} yrs` : null,
      c.current_fixed_ctc != null || c.expected_fixed_ctc != null ? `${c.current_fixed_ctc != null ? Number(c.current_fixed_ctc) : "—"} → ${c.expected_fixed_ctc != null ? Number(c.expected_fixed_ctc) : "—"} LPA` : null,
      c.notice_period || null,
      r.metro ?? c.current_location ?? null,
    ].filter(Boolean) as string[];
  };
  // Same third line as the pipeline: what they told us, else the first gap, else the first plus.
  function lineThree(r: Ranked): { text: string; cls: string } {
    const m = memory[r.row.candidate_id];
    if (m && (m.wants?.length || m.dealbreakers?.length || m.summary)) {
      const bits = [m.wants?.[0] ? `wants ${m.wants[0].toLowerCase()}` : "", m.dealbreakers?.[0] ? `no ${m.dealbreakers[0].toLowerCase()}` : ""].filter(Boolean);
      return { text: `Spoke ${fmtShort(m.at)}: ${bits.length ? bits.join(" · ") : m.summary}`, cls: "text-sky-700 dark:text-sky-300" };
    }
    if (r.gaps[0]) return { text: r.gaps[0], cls: "text-amber-700 dark:text-amber-400" };
    if (r.matched[0]) return { text: r.matched[0], cls: "text-emerald-700 dark:text-emerald-400" };
    return { text: "No reasons yet", cls: "text-slate-400" };
  }

  function renderMatchRow(r: Ranked, activeRowId: string | null) {
    const c = r.row;
    const isActive = activeRowId === c.candidate_id;
    const l3 = lineThree(r);
    const spoke = !!memory[c.candidate_id];
    return (
      <li key={c.candidate_id} className={`border-b border-slate-100 last:border-b-0 dark:border-slate-800 ${isActive ? "bg-teal-50 shadow-[inset_4px_0_0_0] shadow-teal-600 dark:bg-teal-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
        <div className="flex items-start gap-2 px-3 py-3">
          <input type="checkbox" checked={picked.has(c.candidate_id)} onChange={() => toggle(c.candidate_id)} aria-label={`Select ${c.full_name ?? "candidate"}`} className="mt-3 h-3.5 w-3.5 shrink-0 accent-teal-600" />
          <button type="button" aria-current={isActive} onClick={() => { setActiveId(c.candidate_id); setMobileOpen(true); }} className="grid min-w-0 flex-1 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 text-left">
            <span title="How well they match this role"><ScoreRing score={r.score} rank={r.bucket === "stretch" ? 3 : undefined} /></span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span className="max-w-[68%] shrink-0 truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">{c.full_name ?? "Unnamed"}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">{[c.current_job_title, c.current_employer].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] tabular-nums text-slate-500">{factsOf(r).join(" · ") || "No facts yet"}</span>
              <span className={`mt-0.5 block truncate text-[12px] ${l3.cls}`} title={l3.text}>{l3.text}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${spoke ? "bg-emerald-600 text-white" : "border-[1.5px] border-amber-500"}`} title={spoke ? "Spoken to: we remember what they said" : "Not spoken to about this yet"}>{spoke ? <Check className="h-2.5 w-2.5" /> : null}</span>
              {reached[c.candidate_id] && <span className={`rounded-full px-1.5 text-[10.5px] font-medium ${REACHED_STYLE[reached[c.candidate_id].status] ?? REACHED_STYLE.sent}`}>{REACHED_LABEL[reached[c.candidate_id].status] ?? "Messaged"}</span>}
            </span>
          </button>
        </div>
      </li>
    );
  }

  function renderMatchPane(r: Ranked) {
    const c = r.row;
    const m = memory[c.candidate_id];
    const spoke = !!m;
    const name = c.full_name ?? "Unnamed";
    const fact = (label: string, value: string | null | undefined) => <FactTile label={label} value={value} />;
    const toConfirm = [...(c.readiness_missing ?? []).map((k) => MISSING_LABEL[k] ?? k.replace(/_/g, " ")), ...r.gaps.filter((g) => /not known|confirm|not asked/i.test(g))].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 4);
    const strongGap = r.gaps.find((g) => /not .*(NCR|Mumbai|Pune|Bengaluru|Hyderabad|Chennai|Kolkata|Ahmedabad)|abroad/i.test(g));
    const next: { tone: "go" | "warn" | "stop" | "info"; title: string; detail?: string; actions?: React.ReactNode } = reached[c.candidate_id]?.status === "interested"
      ? { tone: "go", title: "Said yes to this role", detail: "Call to confirm pay, notice and relocation, then add to the pipeline.", actions: <button type="button" onClick={() => setPaneTab("call")} className="rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">Open the call form</button> }
      : spoke
        ? r.bucket === "stretch"
          ? { tone: "warn", title: "Spoken to, but a stretch for this role", detail: r.gaps[0], actions: <button type="button" disabled={busy} onClick={() => void addList([r])} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700">Add anyway</button> }
          : { tone: "go", title: "Spoken to, a good match: add to the pipeline", detail: m?.summary || undefined, actions: <button type="button" disabled={busy} onClick={() => void addList([r])} className="rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">Add to pipeline</button> }
        : strongGap
          ? { tone: "warn", title: "Location is the problem", detail: `${strongGap}. Ask if they would move before spending time.`, actions: <button type="button" onClick={() => setPaneTab("call")} className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">Call and ask</button> }
          : { tone: "info", title: r.bucket === "perfect" ? "A strong match nobody has spoken to yet" : "Worth a call", detail: toConfirm.length ? `Confirm: ${toConfirm.join(" · ")}` : undefined, actions: <button type="button" onClick={() => setPaneTab("call")} className="rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">Open the call form</button> };
    return (
      <div className="flex min-h-0 flex-col">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900">
        <div className="flex flex-wrap items-start gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <button type="button" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[12.5px] lg:hidden"><ArrowLeft className="h-3.5 w-3.5" /> List</button>
          <ScoreRing score={r.score} rank={r.bucket === "stretch" ? 3 : undefined} size={52} />
          <div className="min-w-[180px] flex-1">
            <a href={`/candidates/${c.candidate_id}`} target="_blank" rel="noopener noreferrer" className="text-[20px] font-semibold leading-tight tracking-tight text-slate-900 hover:underline dark:text-slate-100">{name}</a>
            <p className="truncate text-[12.5px] text-slate-500">{[c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || "No role on file"}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.pool_tier && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${POOL_TIER_PILL[c.pool_tier as PoolTier]}`}>Pool: {POOL_TIER_LABEL[c.pool_tier as PoolTier]}</span>}
              {c.sub_group && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.sub_group}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {spoke ? (
              <button type="button" disabled={busy} onClick={() => void addList([r])} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"><UserPlus className="h-3.5 w-3.5" /> Add to pipeline</button>
            ) : (
              <button type="button" onClick={() => setPaneTab("call")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700"><PhoneCall className="h-3.5 w-3.5" /> Call now</button>
            )}
            <WriteWhatsAppButton candidateId={c.candidate_id} name={c.full_name ?? "there"} role={roleTitle} />
            <NotAFitMenu onPick={(reason) => dismiss(c.candidate_id, reason)} />
          </div>
        </div>
        <div role="tablist" className="flex gap-0.5 border-b border-slate-100 px-4 dark:border-slate-800">
          {([["overview", "Overview"], ["call", "Call & details"]] as const).map(([k, label]) => (
            <button key={k} role="tab" type="button" aria-selected={paneTab === k} onClick={() => setPaneTab(k)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] ${paneTab === k ? "border-teal-600 font-semibold text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {label}{k === "call" && !spoke && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 p-5">
          <NextStep tone={next.tone} title={next.title} detail={next.detail}>{next.actions}</NextStep>
          {paneTab === "overview" ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {fact("Experience", c.total_experience_years != null ? `${Number(c.total_experience_years)} yrs` : null)}
                {fact("Location", r.metro ?? c.current_location)}
                {fact("Notice", c.notice_period)}
                {fact("Current", c.current_fixed_ctc != null ? `${Number(c.current_fixed_ctc)} LPA` : null)}
                {fact("Expected", c.expected_fixed_ctc != null ? `${Number(c.expected_fixed_ctc)} LPA` : null)}
                {fact("Relocation", c.open_to_relocation)}
              </dl>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Why this match</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.matched.map((x) => (<span key={x} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300"><Check className="h-3 w-3" /> {x}</span>))}
                  {r.gaps.map((x) => (<span key={x} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300">⚠ {x}</span>))}
                  {r.matched.length + r.gaps.length === 0 && <span className="text-[13px] text-slate-400">No reasons yet.</span>}
                </div>
                {c.readiness_tier && c.readiness_tier !== "ready" && (c.readiness_missing?.length ?? 0) > 0 && <p className="mt-2 text-[12px] text-amber-800 dark:text-amber-300">To confirm on a call: {missingText(c.readiness_missing)}</p>}
              </div>
              <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">What we remember from calls</p>
                {m ? (
                  <div className="space-y-1.5 text-[13px]">
                    {m.summary && <p className="text-slate-700 dark:text-slate-300"><span className="font-medium">Spoke {fmtShort(m.at)}:</span> {m.summary}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {(m.wants ?? []).map((w) => (<span key={w} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Wants: {w}</span>))}
                      {(m.dealbreakers ?? []).map((w) => (<span key={w} className="rounded-full bg-rose-50 px-2 py-0.5 text-[12px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Will not accept: {w}</span>))}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-[13px] text-slate-400"><MessageCircle className="h-3.5 w-3.5" /> Nothing yet. Press Call now, and what they say shows here and feeds matching.</p>
                )}
              </div>
              {c.summary && <p className="text-[13px] text-slate-600 dark:text-slate-300">{c.summary}</p>}
              <SkillsStrip candidateId={c.candidate_id} roleText={roleTitle ?? ""} />
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <CvButtons candidateId={c.candidate_id} name={c.full_name} />
              </div>
              <PipelineTemplateActions candidateId={c.candidate_id} mandateId={mandateId} stage="sourced" missing={[]} showOpportunity />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800/60">
                <span className="text-slate-600 dark:text-slate-300">Fill this in when you speak to them. What they say is remembered and used for every future match.</span>
                <a href={`/candidates/${c.candidate_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium"><Phone className="h-3.5 w-3.5" /> Phone is on the profile</a>
              </div>
              <CandidateCallPanel key={c.candidate_id} candidateId={c.candidate_id} roleCluster={roleCluster} onDone={() => router.refresh()} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set(p).add(id)));

  return (
    <div className="space-y-3">
      {cities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="font-medium text-slate-500">Where they are:</span>
          {(
            [
              { k: "all", label: "Everyone", n: allRanked.length },
              { k: "here", label: `In ${cities.join(" / ")}`, n: whereCounts.here },
              { k: "reloc", label: "Elsewhere, open to moving", n: whereCounts.reloc },
              { k: "unknown", label: "Elsewhere, not asked yet", n: whereCounts.unknown },
            ] as { k: Where; label: string; n: number }[]
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => {
                setWhere(o.k);
                setShown(PER_PAGE);
              }}
              className={`rounded-full border px-3 py-1 font-medium ${where === o.k ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {o.label} <span className="opacity-70">{o.n}</span>
            </button>
          ))}
          {where === "unknown" && <span className="text-slate-400">They have not said whether they would relocate. Ask on a call.</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => {
              setTab(g.key);
              setShown(PER_PAGE);
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-semibold ${tab === g.key ? `${g.tone} border-transparent text-white` : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {g.label} <span className={`rounded-full px-1.5 text-xs ${tab === g.key ? "bg-white/20" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}>{counts[g.key]}</span>
          </button>
        ))}
        <p className="text-[12px] text-slate-500">{GROUPS.find((g) => g.key === tab)?.blurb}</p>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
          {flags?.opportunity && (
            <button type="button" onClick={() => setReviewing(true)} disabled={picked.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              <MessageCircle className="h-3.5 w-3.5" /> Review &amp; WhatsApp {picked.size || ""}
            </button>
          )}
          <button type="button" onClick={addPicked} disabled={busy || picked.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add {picked.size || ""} to pipeline
          </button>
        </div>
      </div>

      {readyToReach.length > 0 && flags?.opportunity && picked.size === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 dark:border-teal-900 dark:bg-teal-950/30">
          <p className="flex-1 text-sm text-slate-800 dark:text-slate-100">
            <span className="font-semibold">{readyToReach.length} Perfect match{readyToReach.length === 1 ? "" : "es"}</span> {readyToReach.length === 1 ? "hasn't" : "haven't"} heard about this role yet.
          </p>
          <button type="button" onClick={selectReady} className="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">
            Select them
          </button>
        </div>
      )}

      {list.length === 0 && <p className="rounded-ros-lg border border-dashed border-slate-300 p-6 text-center text-[13px] text-slate-500 dark:border-slate-700">No one in this group yet. The card may be too narrow: try adding more &quot;also fine&quot; worlds or cities.</p>}

      {list.length > 0 && (() => {
        const needle = q.trim().toLowerCase();
        const shownRows = (needle ? list.filter((r) => [r.row.full_name, r.row.current_employer, r.row.current_job_title, r.row.current_location, r.metro].filter(Boolean).join(" ").toLowerCase().includes(needle)) : list).slice(0, shown);
        const active = shownRows.find((r) => r.row.candidate_id === activeId) ?? shownRows[0] ?? null;
        return (
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(350px,430px)_minmax(0,1fr)]">
            <ul className={`${mobileOpen ? "hidden lg:block" : ""} overflow-hidden rounded-ros-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto`}>
              <li className="sticky top-0 z-[2] border-b border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, city" aria-label="Search this list" className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800" />
              </li>
              {shownRows.length === 0 && <li className="p-6 text-center text-[13px] text-slate-400">No one matches that search.</li>}
              {shownRows.map((r) => renderMatchRow(r, active?.row.candidate_id ?? null))}
            </ul>
            <div className={`${mobileOpen ? "" : "hidden lg:block"} rounded-ros-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-3 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto`}>
              {active ? renderMatchPane(active) : null}
            </div>
          </div>
        );
      })()}
      {list.length > shown && (
        <button type="button" onClick={() => setShown((s) => s + PER_PAGE)} className="text-[13px] font-medium text-teal-600 hover:underline">
          Show {Math.min(PER_PAGE, list.length - shown)} more of {list.length - shown}
        </button>
      )}
      {reviewing && (
        <WhatsAppReview
          title={`Tell ${reachIds.length} ${reachIds.length === 1 ? "person" : "people"} about this role`}
          loadPreview={async () => {
            const { d } = await post({ preview: true });
            if (d.ok === false || !d.preview) return { ok: false, error: d.error ?? "Couldn't prepare the messages." } as const;
            if (!d.preview.recipients || d.preview.recipients < 1) return { ok: false, error: "None of them can be messaged right now: opted out, no usable number, or already messaged in the last 30 days." } as const;
            return { ok: true, preview: d.preview } as const;
          }}
          send={async () => {
            const { res, d } = await post({});
            if (!res.ok || d.ok === false) return { ok: false, text: d.error ?? "That didn't work. Nothing was sent." };
            const skipped = (d.noPhone ?? 0) + (d.optedOut ?? 0) + (d.alreadySent ?? 0);
            return { ok: d.sent > 0, text: `Sent to ${d.sent}.${skipped ? ` Skipped ${skipped} (no usable number, opted out, or messaged in the last 30 days).` : ""}${d.over ? ` ${d.over} more were not included, 20 per send.` : ""}${d.failed ? ` ${d.failed} failed.` : ""}` };
          }}
          onDone={() => {
            setPicked(new Set());
            router.refresh();
          }}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
}
