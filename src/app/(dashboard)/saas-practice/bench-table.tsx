"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, FileText, ExternalLink, UserPlus, Loader2, AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import WhatsAppMenu from "@/components/whatsapp-menu";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import { createClient } from "@/lib/supabase/client";
import { dealSizeBandsB2B, salesCycleOptions } from "@/lib/candidate-options";
import { EMPTY_FILTERS, describeFilters, evaluate, filtersFromRole, type Check, type RoleFilters, type RoleOption } from "@/lib/role-fit";
import type { ShortlistSummary } from "@/lib/shortlists";
import SaveShortlist from "./save-shortlist";
import { TIER_LABEL, TIER_PILL, type ReadinessTier } from "@/lib/readiness";
import { FIT_LABEL, HUNTER_LABEL, gapKeys, gapLabels, isIncomplete, passportTone, segmentLabel, type PassportRow } from "@/lib/saas-passport";
import ResumeViewerInline from "../candidates/[id]/resume-viewer-inline";
import PoolControl from "@/components/pool-control";
import type { PoolEntry } from "@/lib/talent-pool";

const PAGE = 40;
const MAX_ASSIGN = 100;

export type BenchRow = PassportRow & { strongRoles: string[]; openTask: string | null; lastAsked: string | null };
const MAX_EMAIL = 30;

// What an email can ask for: the sales passport gaps.
const EMAILABLE = ["segment", "deal size", "quota / attainment", "sales cycle", "hunter or farmer"];
const canEmailAsk = (r: PassportRow & { lastAsked: string | null }) =>
  !!r.email && !r.lastAsked && (r.passport_missing ?? []).some((g) => EMAILABLE.includes(g));
type Recruiter = { id: string; name: string };
type Mode = "all" | "needs" | "complete";

function initials(name: string | null) {
  return (name ?? "?").split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-[96px]">
      <p className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-[12.5px] ${value ? "text-slate-800 dark:text-slate-200" : "text-slate-300 dark:text-slate-600"}`}>{value || "Not known"}</p>
    </div>
  );
}

function ctcText(r: PassportRow) {
  const cur = r.current_fixed_ctc != null ? `${Number(r.current_fixed_ctc)} LPA` : null;
  const exp = r.expected_fixed_ctc != null ? `${Number(r.expected_fixed_ctc)} LPA` : null;
  if (cur && exp) return `${cur} → ${exp}`;
  return cur ? `${cur} (expected not asked)` : exp ? `Expects ${exp}` : null;
}

type RoleItem = { row: BenchRow; checks: Check[]; fails: number; unknowns: number; ai: { fit: string; status: string } | null; stage: string | null };

export default function BenchTable({
  rows,
  segmentOptions,
  recruiters,
  roles,
  matchesByRole,
  stageByRole,
  relocation,
  lists,
  waOpportunity,
  pool,
}: {
  rows: BenchRow[];
  segmentOptions: string[];
  recruiters: Recruiter[];
  roles: RoleOption[];
  matchesByRole: Record<string, Record<string, { fit: string; status: string }>>;
  stageByRole: Record<string, Record<string, string>>;
  relocation: Record<string, string>;
  lists: ShortlistSummary[];
  waOpportunity: boolean;
  pool: Record<string, PoolEntry>;
}) {
  const me = useMyFirstName();
  const [mode, setMode] = useState<Mode>("needs");
  const [q, setQ] = useState("");
  const [fit, setFit] = useState("all");
  const [segment, setSegment] = useState("all");
  const [gap, setGap] = useState("all");
  const [matchOnly, setMatchOnly] = useState(false);
  const [poolFilter, setPoolFilter] = useState<"all" | "in" | "out">("all");
  const [sort, setSort] = useState<"gaps" | "passport" | "experience">("passport");
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [note, setNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [roleId, setRoleId] = useState("");
  const [rf, setRf] = useState<RoleFilters>(EMPTY_FILTERS);
  const [roleView, setRoleView] = useState<"fits" | "close">("fits");
  const [addedLocal, setAddedLocal] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [waSending, setWaSending] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailed, setEmailed] = useState<Set<string>>(new Set());
  const [cvFor, setCvFor] = useState<BenchRow | null>(null);
  const [cv, setCv] = useState<{ url: string; fileName: string } | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);

  const counts = useMemo(() => {
    const needs = rows.filter(isIncomplete).length;
    return { all: rows.length, needs, complete: rows.length - needs };
  }, [rows]);

  const gapCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (isIncomplete(r)) for (const g of gapLabels(r)) m.set(g, (m.get(g) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (mode === "needs" && !isIncomplete(r)) return false;
      if (mode === "complete" && isIncomplete(r)) return false;
      if (fit !== "all" && r.practice_fit !== fit) return false;
      if (segment !== "all" && !(r.segments ?? []).includes(segment)) return false;
      if (gap !== "all" && !gapLabels(r).includes(gap)) return false;
      if (matchOnly && r.strongRoles.length === 0) return false;
      if (poolFilter === "in" && !pool[r.candidate_id]) return false;
      if (poolFilter === "out" && pool[r.candidate_id]) return false;
      if (needle) {
        const hay = `${r.full_name ?? ""} ${r.current_employer ?? ""} ${r.current_job_title ?? ""} ${r.city ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sort === "experience") return Number(b.total_experience_years ?? 0) - Number(a.total_experience_years ?? 0);
      if (sort === "gaps") return gapLabels(a).length - gapLabels(b).length;
      return b.passport_score - a.passport_score;
    });
    return out;
  }, [rows, mode, q, fit, segment, gap, matchOnly, poolFilter, pool, sort]);

  const role = roles.find((r) => r.id === roleId) ?? null;

  const roleItems = useMemo<RoleItem[]>(() => {
    if (!role) return [];
    const needle = q.trim().toLowerCase();
    const items: RoleItem[] = [];
    for (const row of rows) {
      if (fit !== "all" && row.practice_fit !== fit) continue;
      if (segment !== "all" && !(row.segments ?? []).includes(segment)) continue;
      if (needle) {
        const hay = `${row.full_name ?? ""} ${row.current_employer ?? ""} ${row.current_job_title ?? ""} ${row.city ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      const checks = evaluate(row, rf, relocation[row.candidate_id] ?? null);
      const fails = checks.filter((c) => c.state === "fail").length;
      if (fails > 1) continue;
      const m = matchesByRole[role.id]?.[row.candidate_id] ?? null;
      items.push({
        row,
        checks,
        fails,
        unknowns: checks.filter((c) => c.state === "unknown").length,
        ai: m,
        stage: stageByRole[role.id]?.[row.candidate_id] ?? null,
      });
    }
    const aiRank = (i: RoleItem) => (i.ai?.fit === "strong" ? 0 : i.ai?.fit === "possible" ? 1 : 2);
    items.sort(
      (a, b) =>
        Number(!!a.stage) - Number(!!b.stage) ||
        a.fails - b.fails ||
        aiRank(a) - aiRank(b) ||
        a.unknowns - b.unknowns ||
        b.row.passport_score - a.row.passport_score
    );
    return items;
  }, [role, rows, rf, q, fit, segment, matchesByRole, stageByRole, relocation]);

  const roleFits = roleItems.filter((i) => i.fails === 0);
  const roleClose = roleItems.filter((i) => i.fails === 1);
  const roleVisible = roleView === "fits" ? roleFits : roleClose;
  const roleInfo = useMemo(() => new Map(roleItems.map((i) => [i.row.candidate_id, i])), [roleItems]);
  const listRows: BenchRow[] = role ? roleVisible.map((i) => i.row) : filtered;

  function pickRole(id: string) {
    setRoleId(id);
    setPicked(new Set());
    setAddMsg(null);
    setShown(PAGE);
    setRoleView("fits");
    const r = roles.find((x) => x.id === id);
    setRf(r ? filtersFromRole(r) : EMPTY_FILTERS);
  }

  async function addToRole(ids: string[]) {
    if (!role || ids.length === 0 || adding) return;
    setAdding(true);
    setAddMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    let added = 0;
    let existing = 0;
    let failed = 0;
    const doneIds: string[] = [];
    for (const id of ids) {
      const { error } = await supabase.from("candidate_mandate_links").insert({
        candidate_id: id,
        mandate_id: role.id,
        added_by: user?.id ?? null,
        match_source: "talent_board",
        matched_at: now,
      });
      if (!error) {
        added++;
        doneIds.push(id);
      } else if (/duplicate|unique/i.test(error.message)) {
        existing++;
        doneIds.push(id);
      } else failed++;
    }
    if (doneIds.length) setAddedLocal((prev) => new Set([...prev, ...doneIds.map((d) => `${role.id}:${d}`)]));
    setPicked(new Set());
    setAddMsg({
      ok: failed === 0,
      text: `${added} added to ${role.title}${existing ? `, ${existing} were already there` : ""}${failed ? `, ${failed} could not be added` : ""}.`,
    });
    setAdding(false);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickAllFiltered() {
    setPicked(new Set(listRows.filter((r) => !r.openTask && !assigned.has(r.candidate_id)).slice(0, MAX_ASSIGN).map((r) => r.candidate_id)));
  }

  async function assign() {
    if (!assignee || picked.size === 0) return;
    setAssigning(true);
    setAssignMsg(null);
    try {
      const res = await fetch("/api/saas-practice/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: Array.from(picked), recruiterId: assignee, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignMsg({ ok: false, text: body.error ?? "That didn't work. Try again." });
      } else {
        setAssigned((prev) => new Set([...prev, ...picked]));
        setAssignMsg({
          ok: true,
          text: `${body.created} task${body.created === 1 ? "" : "s"} sent to ${body.assignee ?? "the recruiter"}${body.skipped ? `, ${body.skipped} already had one` : ""}.`,
        });
        setPicked(new Set());
        setNote("");
      }
    } catch {
      setAssignMsg({ ok: false, text: "Network error. Try again." });
    }
    setAssigning(false);
  }

  async function whatsappOpportunity(ids: string[]) {
    if (!role || ids.length === 0 || waSending) return;
    const n = Math.min(ids.length, 20);
    const ok = window.confirm(
      `Send ${n} candidate${n === 1 ? "" : "s"} a WhatsApp message about "${role.title}"?\n\nIt uses the approved opportunity template, never names the client, and is charged per message by Meta. Anyone who opted out or was sent it in the last 30 days is skipped.`
    );
    if (!ok) return;
    setWaSending(true);
    setAddMsg(null);
    try {
      const res = await fetch("/api/whatsapp/role-opportunity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId: role.id, candidateIds: ids.slice(0, 20) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        setAddMsg({ ok: false, text: body.error ?? "That didn't work. Try again." });
      } else {
        const parts = [`${body.sent} sent`];
        if (body.failed) parts.push(`${body.failed} failed${body.error ? ` (${body.error})` : ""}`);
        const skipped = (body.noPhone ?? 0) + (body.optedOut ?? 0) + (body.alreadySent ?? 0);
        if (skipped) parts.push(`${skipped} skipped (no mobile, opted out, or already sent)`);
        setAddMsg({ ok: !body.failed || body.sent > 0, text: `WhatsApp: ${parts.join(", ")}.` });
        setPicked(new Set());
      }
    } catch {
      setAddMsg({ ok: false, text: "Network error. Try again." });
    }
    setWaSending(false);
  }

  async function emailAsk(ids: string[]) {
    if (ids.length === 0 || emailing) return;
    const n = Math.min(ids.length, MAX_EMAIL);
    const ok = window.confirm(
      `Email ${n} candidate${n === 1 ? "" : "s"} asking for their sales details?\n\nIt goes from the StaffAnchor mailbox, counts toward today's sending limit, and skips anyone who opted out or was contacted in the last 30 days.`
    );
    if (!ok) return;
    setEmailing(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/saas-practice/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: ids.slice(0, MAX_EMAIL) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailMsg({ ok: false, text: body.error ?? "That didn't work. Try again." });
      } else {
        const sentIds = new Set(ids.slice(0, MAX_EMAIL));
        if (body.sent > 0) setEmailed((prev) => new Set([...prev, ...sentIds]));
        const parts = [`${body.sent} sent`];
        if (body.failed) parts.push(`${body.failed} failed`);
        if (body.skipped) parts.push(`${body.skipped} skipped (opted out, contacted recently, no email, or nothing to ask)`);
        setEmailMsg({ ok: body.sent > 0 || !body.failed, text: `${parts.join(", ")}.${body.note ? ` ${body.note}` : ""}` });
        setPicked(new Set());
      }
    } catch {
      setEmailMsg({ ok: false, text: "Network error. Try again." });
    }
    setEmailing(false);
  }

  async function openCv(r: BenchRow) {
    setCvFor(r);
    setCv(null);
    setCvError(null);
    setCvLoading(true);
    try {
      const res = await fetch(`/api/candidates/${r.candidate_id}/cv-url`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) setCv({ url: body.url, fileName: body.fileName ?? "resume" });
      else setCvError(body.error ?? "The CV could not be opened.");
    } catch {
      setCvError("Network error while opening the CV.");
    }
    setCvLoading(false);
  }

  const select = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[12.5px]";
  const tab = (m: Mode, label: string, n: number) => (
    <button
      key={m}
      type="button"
      onClick={() => {
        setMode(m);
        setShown(PAGE);
      }}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        mode === m ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {label} <span className="opacity-70">{n}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-ros-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">Find people for a role</p>
          <select value={roleId} onChange={(e) => pickRole(e.target.value)} className={`${select} min-w-[260px]`}>
            <option value="">Pick an open B2B role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.client ? ` · ${r.client}` : ""}
                {r.status === "on_hold" ? " (on hold)" : ""}
              </option>
            ))}
          </select>
          {role && (
            <>
              <button type="button" onClick={() => pickRole(role.id)} className="text-[12px] text-blue-600 hover:underline">
                Reset to the role
              </button>
              <button type="button" onClick={() => pickRole("")} className="text-[12px] text-slate-500 hover:underline">
                Back to the whole bench
              </button>
              <Link href={`/mandates/${role.id}`} className="text-[12px] text-slate-500 hover:underline">
                Open the role
              </Link>
            </>
          )}
        </div>
        {role && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
            <label className="col-span-2 text-[11px] text-slate-500">
              Cities (comma separated)
              <input value={rf.cities} onChange={(e) => setRf({ ...rf, cities: e.target.value })} className={`${select} w-full mt-0.5`} placeholder="Noida, Gurgaon" />
            </label>
            <label className="text-[11px] text-slate-500">
              Experience from (yrs)
              <input value={rf.expMin} onChange={(e) => setRf({ ...rf, expMin: e.target.value })} inputMode="decimal" className={`${select} w-full mt-0.5`} />
            </label>
            <label className="text-[11px] text-slate-500">
              Experience to (yrs)
              <input value={rf.expMax} onChange={(e) => setRf({ ...rf, expMax: e.target.value })} inputMode="decimal" className={`${select} w-full mt-0.5`} />
            </label>
            <label className="text-[11px] text-slate-500">
              Current CTC up to (LPA)
              <input value={rf.ctcMax} onChange={(e) => setRf({ ...rf, ctcMax: e.target.value })} inputMode="decimal" className={`${select} w-full mt-0.5`} />
            </label>
            <label className="text-[11px] text-slate-500">
              Notice up to
              <select value={rf.noticeMax} onChange={(e) => setRf({ ...rf, noticeMax: e.target.value })} className={`${select} w-full mt-0.5`}>
                <option value="">Any</option>
                {[15, 30, 45, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-500">
              Deal size at least
              <select value={rf.deal} onChange={(e) => setRf({ ...rf, deal: e.target.value })} className={`${select} w-full mt-0.5`}>
                <option value="">Any</option>
                {(["INR", "USD"] as const).map((cur) => (
                  <optgroup key={cur} label={cur}>
                    {dealSizeBandsB2B[cur].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-500">
              Sales cycle at least
              <select value={rf.cycle} onChange={(e) => setRf({ ...rf, cycle: e.target.value })} className={`${select} w-full mt-0.5`}>
                <option value="">Any</option>
                {salesCycleOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-500">
              Hunter or farmer
              <select value={rf.hunter} onChange={(e) => setRf({ ...rf, hunter: e.target.value })} className={`${select} w-full mt-0.5`}>
                <option value="">Any</option>
                <option value="hunter">Hunter</option>
                <option value="farmer">Farmer</option>
              </select>
            </label>
            <label className="text-[11px] text-slate-500">
              Readiness
              <select value={rf.ready} onChange={(e) => setRf({ ...rf, ready: e.target.value as RoleFilters["ready"] })} className={`${select} w-full mt-0.5`}>
                <option value="any">Any</option>
                <option value="ready">Ready to shortlist</option>
                <option value="ready_almost">Ready or almost</option>
              </select>
            </label>
            <label className="col-span-2 flex items-end gap-1.5 text-[12px] text-slate-600 dark:text-slate-300 pb-1.5">
              <input type="checkbox" checked={rf.relocate} onChange={(e) => setRf({ ...rf, relocate: e.target.checked })} />
              Count people open to relocating
            </label>
          </div>
        )}
        {role && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setRoleView("fits")}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${roleView === "fits" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800"}`}
            >
              Fit the role <span className="opacity-70">{roleFits.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setRoleView("close")}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${roleView === "close" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800"}`}
            >
              Miss one requirement <span className="opacity-70">{roleClose.length}</span>
            </button>
            <span className="text-[11.5px] text-slate-500 ml-2">&quot;?&quot; means the profile has no answer yet. Those people are not ruled out.</span>
          </div>
        )}
        {addMsg && (
          <p className={`text-[12.5px] flex items-center gap-1.5 ${addMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
            {addMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {addMsg.text}
          </p>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-1 ${role ? "hidden" : ""}`}>
        {tab("needs", "Needs details", counts.needs)}
        {tab("complete", "Ready to use", counts.complete)}
        {tab("all", "Everyone", counts.all)}
      </div>

      {!role && mode === "needs" && gapCounts.length > 0 && (
        <div className="rounded-ros-xl border border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
          <p className="text-[12.5px] text-slate-700 dark:text-slate-300 mb-2">
            <span className="font-medium">What is missing most.</span> Tap one to list those people, then ask a recruiter to collect it.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {gapCounts.slice(0, 9).map(([g, n]) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGap(gap === g ? "all" : g);
                  setShown(PAGE);
                }}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${
                  gap === g ? "border-amber-600 bg-amber-600 text-white" : "border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
                }`}
              >
                {g} · {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Name, company, city"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2 py-1.5 text-[12.5px] w-52"
          />
        </div>
        <select value={fit} onChange={(e) => setFit(e.target.value)} className={select}>
          <option value="all">SaaS and tech</option>
          <option value="saas">SaaS only</option>
          <option value="tech">Other tech only</option>
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className={select}>
          <option value="all">Any segment sold to</option>
          {segmentOptions.map((s) => (
            <option key={s} value={s}>
              {segmentLabel(s)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={matchOnly} onChange={(e) => setMatchOnly(e.target.checked)} />
          Strong match for an open role
        </label>
        <select value={poolFilter} onChange={(e) => setPoolFilter(e.target.value as "all" | "in" | "out")} className={select}>
          <option value="all">Talent Pool: all</option>
          <option value="in">In the Talent Pool</option>
          <option value="out">Not in the pool yet</option>
        </select>
        {gap !== "all" && (
          <button type="button" onClick={() => setGap("all")} className="text-[12px] text-blue-600 hover:underline">
            Clear &quot;{gap}&quot;
          </button>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${select} ml-auto`}>
          <option value="passport">Sort: most complete first</option>
          <option value="gaps">Sort: fewest gaps first</option>
          <option value="experience">Sort: most experienced</option>
        </select>
      </div>

      {/* Ask a recruiter to collect details */}
      <div className="sticky top-2 z-10 rounded-ros-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-slate-600 dark:text-slate-300">
          <span className="font-medium">{picked.size}</span> selected
        </span>
        <button type="button" onClick={pickAllFiltered} className="text-[12px] text-blue-600 hover:underline">
          Select the {Math.min(listRows.filter((r) => !r.openTask && !assigned.has(r.candidate_id)).length, MAX_ASSIGN)} shown by the filters
        </button>
        {picked.size > 0 && (
          <button type="button" onClick={() => setPicked(new Set())} className="text-[12px] text-slate-500 hover:underline">
            Clear
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={select}>
            <option value="">Ask who to collect details…</option>
            {recruiters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[12.5px] w-44"
          />
          <SaveShortlist
            ids={picked.size > 0 ? Array.from(picked) : listRows.map((r) => r.candidate_id)}
            label={picked.size > 0 ? `Save ${picked.size} as shortlist` : `Save these ${listRows.length} as shortlist`}
            defaultName={`${role ? role.title : "B2B SaaS bench"} · ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}`}
            description={describeFilters(role, role ? rf : EMPTY_FILTERS)}
            lists={lists}
          />
          {role && (
            <button
              type="button"
              onClick={() => addToRole(Array.from(picked))}
              disabled={adding || picked.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Add {picked.size || ""} to this role
            </button>
          )}
          {role && waOpportunity && (
            <button
              type="button"
              onClick={() => whatsappOpportunity(Array.from(picked))}
              disabled={waSending || picked.size === 0}
              title="Automatic: StaffAnchor's WhatsApp sends each selected person the approved role-opportunity template to ask if they are interested. The client is never named. Meta charges per message."
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 px-3 py-1.5 text-[12.5px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
            >
              {waSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              WhatsApp the opportunity (auto, template)
            </button>
          )}
          <button
            type="button"
            onClick={assign}
            disabled={assigning || !assignee || picked.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Send as tasks
          </button>
          <button
            type="button"
            onClick={() => emailAsk(Array.from(picked))}
            disabled={emailing || picked.size === 0}
            title="Email the selected people asking for the sales details their profile lacks"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Email the ask
          </button>
        </div>
        {emailMsg && (
          <p className={`basis-full text-[12.5px] flex items-center gap-1.5 ${emailMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
            {emailMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {emailMsg.text}
          </p>
        )}
        {assignMsg && (
          <p className={`basis-full text-[12.5px] flex items-center gap-1.5 ${assignMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
            {assignMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {assignMsg.text}
          </p>
        )}
      </div>

      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
        {role ? `${roleVisible.length} ${roleView === "fits" ? "fit" : "miss one requirement for"} ${role.title}` : `${filtered.length} of ${rows.length} candidates`}
      </p>

      <ul className="space-y-2">
        {listRows.slice(0, shown).map((r) => {
          const gaps = gapLabels(r);
          const tier = r.readiness_tier as ReadinessTier | null;
          const taskSent = !!r.openTask || assigned.has(r.candidate_id);
          const askedOn = r.lastAsked ?? (emailed.has(r.candidate_id) ? "just now" : null);
          return (
            <li key={r.candidate_id} className="rounded-ros-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  checked={picked.has(r.candidate_id)}
                  onChange={() => toggle(r.candidate_id)}
                  disabled={taskSent}
                  aria-label={`Select ${r.full_name ?? "candidate"}`}
                  className="mt-1.5 h-4 w-4 shrink-0"
                />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  {initials(r.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/candidates/${r.candidate_id}`} className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600">
                      {r.full_name ?? "Unnamed"}
                    </Link>
                    {r.practice_fit && <Badge tone="accent">{FIT_LABEL[r.practice_fit]}</Badge>}
                    {tier && <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ring-1 ${TIER_PILL[tier]}`}>{TIER_LABEL[tier]}</span>}
                    <Badge tone={passportTone(r.passport_score)}>Passport {r.passport_score}%</Badge>
                    {taskSent && <Badge tone="info">Details requested</Badge>}
                    {askedOn && <Badge tone="neutral">Emailed {askedOn}</Badge>}
                  </div>
                  <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {[r.current_job_title, r.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.total_experience_years != null ? ` · ${Number(r.total_experience_years)} yrs` : ""}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2">
                    <Fact label="Sells to" value={(r.segments ?? []).map(segmentLabel).join(", ") || null} />
                    <Fact label="Deal size" value={r.deal_size} />
                    <Fact label="Quota" value={r.quota} />
                    <Fact label="Cycle" value={r.sales_cycle} />
                    <Fact label="Style" value={r.hunter_farmer ? HUNTER_LABEL[r.hunter_farmer] : null} />
                    <Fact label="CTC" value={ctcText(r)} />
                    <Fact label="Notice" value={r.notice_period} />
                  </div>

                  {gaps.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-slate-500">Ask for:</span>
                      {gaps.map((g) => (
                        <span key={g} className="rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 ring-1 ring-amber-200/70 dark:ring-amber-800/60 px-2 py-0.5 text-[11.5px]">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                  {role && roleInfo.get(r.candidate_id) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {roleInfo.get(r.candidate_id)!.ai && (
                        <Badge tone={roleInfo.get(r.candidate_id)!.ai!.fit === "strong" ? "success" : "neutral"}>
                          AI: {roleInfo.get(r.candidate_id)!.ai!.fit} for this role
                        </Badge>
                      )}
                      {roleInfo.get(r.candidate_id)!.checks.map((c) => (
                        <span
                          key={c.key}
                          title={c.detail}
                          className={`rounded-full px-2 py-0.5 text-[11.5px] ring-1 ${
                            c.state === "pass"
                              ? "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800"
                              : c.state === "fail"
                                ? "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800"
                                : "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                          }`}
                        >
                          {c.state === "pass" ? "✓" : c.state === "fail" ? "✗" : "?"} {c.label}: {c.detail}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.strongRoles.length > 0 && (
                    <p className="mt-2 text-[12px] text-emerald-700 dark:text-emerald-400">Strong match for: {r.strongRoles.join(", ")}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                  <PoolControl candidateId={r.candidate_id} entry={pool[r.candidate_id] ?? null} compact />
                  <button
                    type="button"
                    onClick={() => openCv(r)}
                    disabled={!r.has_cv}
                    title={r.has_cv ? "Read the CV here" : "No CV on file"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    <FileText className="h-3.5 w-3.5" /> CV
                  </button>
                  <WhatsAppMenu
                    phone={r.phone}
                    templates={candidateTemplates(r.full_name, { me, candidateId: r.candidate_id, missing: gapKeys(r) }).filter((t) => t.key !== "intro")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  />
                  {role &&
                    (() => {
                      const info = roleInfo.get(r.candidate_id);
                      const inRole = info?.stage ?? (addedLocal.has(`${role.id}:${r.candidate_id}`) ? "added" : null);
                      return inRole ? (
                        <span className="inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
                          In pipeline{inRole !== "added" ? `: ${inRole.replace(/_/g, " ")}` : ""}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToRole([r.candidate_id])}
                          disabled={adding}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Add to role
                        </button>
                      );
                    })()}
                  {canEmailAsk({ ...r, lastAsked: askedOn }) && (
                    <button
                      type="button"
                      onClick={() => emailAsk([r.candidate_id])}
                      disabled={emailing}
                      title="Email this person asking for the sales details their profile lacks"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" /> Email the ask
                    </button>
                  )}
                  <Link
                    href={`/candidates/${r.candidate_id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Profile
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
        {listRows.length === 0 && (
          <li className="rounded-ros-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-10 text-center text-[13px] text-slate-500">
            Nobody matches these filters.
          </li>
        )}
      </ul>
      {listRows.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12.5px] hover:bg-slate-50 dark:hover:bg-slate-800">
          Show {Math.min(PAGE, listRows.length - shown)} more
        </button>
      )}

      <Drawer open={!!cvFor} onClose={() => setCvFor(null)} title={cvFor?.full_name ?? "CV"} widthClassName="max-w-3xl">
        {cvFor && (
          <div className="-mx-5 -my-5 flex h-[calc(100vh-3.5rem)] flex-col">
            <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-3 space-y-2">
              <p className="text-[12.5px] text-slate-500">
                {[cvFor.current_job_title, cvFor.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                {cvFor.city ? ` · ${cvFor.city}` : ""}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Fact label="Sells to" value={(cvFor.segments ?? []).map(segmentLabel).join(", ") || null} />
                <Fact label="Deal size" value={cvFor.deal_size} />
                <Fact label="Quota" value={cvFor.quota} />
                <Fact label="Cycle" value={cvFor.sales_cycle} />
                <Fact label="CTC" value={ctcText(cvFor)} />
                <Fact label="Notice" value={cvFor.notice_period} />
              </div>
              {gapLabels(cvFor).length > 0 && <p className="text-[12px] text-amber-700 dark:text-amber-400">Not on the profile yet: {gapLabels(cvFor).join(", ")}. Check the CV for these.</p>}
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-800/50">
              {cvLoading && (
                <div className="flex items-center gap-2 p-6 text-[13px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Opening the CV…
                </div>
              )}
              {cvError && <p className="p-6 text-[13px] text-rose-600">{cvError}</p>}
              {cv && <ResumeViewerInline signedUrl={cv.url} fileName={cv.fileName} />}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
