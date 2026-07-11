"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ResumePreview from "./[id]/resume-preview";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowUpRight,
  Settings2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  X,
  Trash2,
  Link2,
  Send as SendIcon,
  Loader2,
} from "lucide-react";

export type OpenMandate = {
  id: string;
  role_title: string;
  client_name: string;
};

export type CandidateRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  current_location: string | null;
  current_employer: string | null;
  current_job_title: string | null;
  category: string | null;
  sub_domain: string | null;
  total_experience_years: number | null;
  current_fixed_ctc: number | null;
  notice_period: string | null;
  current_employment_status: string | null;
  status: string;
  current_industry: string | null;
  industries: string[] | null;
  created_by: string | null;
  recruiter_assessment: Record<string, unknown> | null;
  segment_data: Record<string, unknown> | null;
  resume_file_url: string | null;
  // Pre-computed server-side (candidates/page.tsx batches every visible
  // row's resume into one createSignedUrls call) so this row never needs
  // its own client-side Storage round trip -- see ResumeCell below.
  resume_signed_url: string | null;
  ai_summary: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_input: "Awaiting Input",
  lead: "Lead",
  registered: "Registered",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  client_interview: "Client Interview",
  offer: "Offer",
  placed: "Placed",
  alumni: "Alumni",
  inactive: "Inactive",
};

// ROS Phase 3: statuses now map onto the shared 6-tone Badge system
// instead of 11 bespoke one-off colors -- consolidates the palette per
// the brief's "avoid too many colors" guidance while keeping open vs.
// closed vs. at-risk states visually distinct.
const STATUS_TONE: Record<string, BadgeTone> = {
  awaiting_input: "warning",
  lead: "neutral",
  registered: "info",
  under_review: "accent",
  shortlisted: "success",
  submitted: "accent",
  client_interview: "info",
  offer: "success",
  placed: "success",
  alumni: "neutral",
  inactive: "danger",
};

const CREATED_BY_LABEL: Record<string, string> = {
  quick_apply: "Quick Apply",
  self_registration: "Job Portal",
  recruiter_created: "Recruiter Added",
};

const CREATED_BY_TONE: Record<string, BadgeTone> = {
  quick_apply: "accent",
  self_registration: "info",
  recruiter_created: "neutral",
};

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales",
};

const RECOMMENDATION_TONE: Record<string, BadgeTone> = {
  "Strong Fit": "success",
  "Fit with Reservations": "warning",
  "Not a Fit": "danger",
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ScoreCell({ value }: { value: number | undefined }) {
  if (!value) return <span className="text-[11px] text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${n <= value ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-700"}`}
        />
      ))}
      <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{value}/5</span>
    </span>
  );
}

// Signed URL is computed server-side for every row in one batched call
// (see candidates/page.tsx) -- this used to be a per-row useEffect firing
// its own createSignedUrl request on mount, which meant up to 100 separate
// Storage API round trips on a full page of results. Now it's a pure
// render with no network activity at all.
function ResumeCell({ resumeFileUrl, resumeSignedUrl }: { resumeFileUrl: string | null; resumeSignedUrl: string | null }) {
  if (!resumeFileUrl) return <span className="text-[11px] text-slate-300">—</span>;
  if (!resumeSignedUrl) return <span className="text-[11px] text-red-500">Not found</span>;
  return <ResumePreview signedUrl={resumeSignedUrl} fileName={resumeFileUrl.replace(/^resumes\//, "")} label="Preview" />;
}

function PreviousIndustriesCell({
  current,
  industries,
}: {
  current: string | null;
  industries: string[] | null;
}) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const former = (industries ?? []).filter((i) => i !== current);

  if (former.length === 0) return <span className="text-[11px] text-slate-300">—</span>;

  const MAX_SHOWN = 2;
  const shown = former.slice(0, MAX_SHOWN);
  const overflow = former.length - shown.length;

  function handleEnter() {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estHeight = 44 + former.length * 22;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceAbove >= estHeight || spaceAbove > spaceBelow;
    let left = rect.left;
    const maxLeft = window.innerWidth - 272;
    if (left > maxLeft) left = Math.max(12, maxLeft);
    setPos({
      left,
      top: showAbove ? undefined : rect.bottom + 6,
      bottom: showAbove ? window.innerHeight - rect.top + 6 : undefined,
    });
    setHover(true);
  }

  return (
    <div
      ref={wrapRef}
      className="flex flex-wrap items-center gap-1 max-w-[180px] cursor-default"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHover(false)}
    >
      {shown.map((i) => (
        <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          {i}
        </span>
      ))}
      {overflow > 0 && <span className="text-[10px] text-slate-400">+{overflow}</span>}
      {hover && pos && (
        <div
          className="fixed z-[60] w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2.5"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
        >
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
            All previous industries ({former.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {former.map((i) => (
              <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                {i}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function roleLevelFor(c: CandidateRow): string {
  const seg = c.segment_data ?? {};
  const level = seg["role_level"];
  const team = seg["team"];
  if (!level) return "—";
  const levelStr = String(level);
  if (typeof team === "number" && team > 0) return `${levelStr} · Team of ${team}`;
  return levelStr;
}

type ColumnDef = {
  key: string;
  label: string;
  render: (c: CandidateRow) => React.ReactNode;
  headerClassName?: string;
};

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: "created_at",
    label: "Profile Created",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(c.created_at)}</span>,
  },
  {
    key: "email",
    label: "Email",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 truncate block max-w-[180px]">{c.email}</span>,
  },
  {
    key: "phone",
    label: "Number",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.phone ?? "—"}</span>,
  },
  {
    key: "current_fixed_ctc",
    label: "Current Fixed CTC",
    render: (c) => (
      <span className="text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
        {c.current_fixed_ctc ? `₹${c.current_fixed_ctc}L` : "—"}
      </span>
    ),
  },
  {
    key: "total_experience_years",
    label: "Total Experience",
    render: (c) => (
      <span className="text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
        {c.total_experience_years ?? "—"} yrs
      </span>
    ),
  },
  {
    key: "current_job_title",
    label: "Current Title",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 truncate block max-w-[160px]">{c.current_job_title ?? "—"}</span>,
  },
  {
    key: "current_employer",
    label: "Current Company",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 truncate block max-w-[160px]">{c.current_employer ?? "—"}</span>,
  },
  {
    key: "category",
    label: "Major Domain",
    render: (c) => (
      <div>
        <span className="text-slate-700 dark:text-slate-300">{CATEGORY_LABEL[c.category ?? ""] ?? "—"}</span>
        {c.sub_domain && <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{c.sub_domain}</div>}
      </div>
    ),
  },
  {
    key: "current_location",
    label: "Location",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.current_location ?? "—"}</span>,
  },
  {
    key: "role_level",
    label: "IC / Team Lead",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{roleLevelFor(c)}</span>,
  },
  {
    key: "recommendation",
    label: "Recruiter's Assessment",
    render: (c) => {
      const rec = (c.recruiter_assessment?.["overall_recommendation"] as string | undefined) ?? undefined;
      if (!rec) return <span className="text-[11px] text-slate-400">Not assessed</span>;
      return (
        <Badge tone={RECOMMENDATION_TONE[rec] ?? "neutral"} size="sm" className="normal-case tracking-normal">
          {rec}
        </Badge>
      );
    },
  },
  {
    key: "status",
    label: "Status",
    render: (c) => (
      <Badge tone={STATUS_TONE[c.status] ?? "neutral"} size="sm" className="normal-case tracking-normal">
        {STATUS_LABEL[c.status] ?? c.status}
      </Badge>
    ),
  },
  {
    key: "origin",
    label: "Origin",
    render: (c) => {
      if (!c.created_by) return <span className="text-[11px] text-slate-300">—</span>;
      return (
        <Badge tone={CREATED_BY_TONE[c.created_by] ?? "neutral"} size="sm" className="normal-case tracking-normal">
          {CREATED_BY_LABEL[c.created_by] ?? c.created_by}
        </Badge>
      );
    },
  },
  {
    key: "current_industry",
    label: "Current Industry",
    render: (c) =>
      c.current_industry ? (
        <Badge tone="success" size="sm" className="normal-case tracking-normal">
          {c.current_industry}
        </Badge>
      ) : (
        <span className="text-[11px] text-slate-300">—</span>
      ),
  },
  {
    key: "previous_industries",
    label: "Previous Industries",
    render: (c) => <PreviousIndustriesCell current={c.current_industry} industries={c.industries} />,
  },
  {
    key: "sub_domain",
    label: "Sub-domain",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 truncate block max-w-[160px]">{c.sub_domain ?? "—"}</span>,
  },
  {
    key: "current_employment_status",
    label: "Employment Status",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.current_employment_status ?? "—"}</span>,
  },
  {
    key: "notice_period",
    label: "Days to Join",
    render: (c) => <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.notice_period ?? "—"}</span>,
  },
  {
    key: "resume",
    label: "Resume",
    render: (c) => <ResumeCell resumeFileUrl={c.resume_file_url} resumeSignedUrl={c.resume_signed_url} />,
  },
  {
    key: "communication_score",
    label: "Communication",
    render: (c) => <ScoreCell value={c.recruiter_assessment?.["communication_score"] as number | undefined} />,
  },
  {
    key: "confidence_score",
    label: "Confidence",
    render: (c) => <ScoreCell value={c.recruiter_assessment?.["confidence_score"] as number | undefined} />,
  },
  {
    key: "coachability_score",
    label: "Attitude / Coachability",
    render: (c) => <ScoreCell value={c.recruiter_assessment?.["coachability_score"] as number | undefined} />,
  },
  {
    key: "job_stability",
    label: "Job Stability",
    render: (c) => (
      <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {(c.recruiter_assessment?.["job_stability"] as string | undefined) ?? "—"}
      </span>
    ),
  },
  {
    key: "relocation_verified",
    label: "Relocation — Verified",
    render: (c) => (
      <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {(c.recruiter_assessment?.["relocation_verified"] as string | undefined) ?? "—"}
      </span>
    ),
  },
  {
    key: "notice_verified",
    label: "Notice — Verified",
    render: (c) => (
      <span className="text-slate-500 dark:text-slate-400 truncate block max-w-[140px]">
        {(c.recruiter_assessment?.["notice_verified"] as string | undefined) ?? "—"}
      </span>
    ),
  },
  {
    key: "compensation_verified",
    label: "Compensation — Verified",
    render: (c) => (
      <span className="text-slate-500 dark:text-slate-400 truncate block max-w-[160px]">
        {(c.recruiter_assessment?.["compensation_verified"] as string | undefined) ?? "—"}
      </span>
    ),
  },
  {
    key: "red_flags",
    label: "Red Flags",
    render: (c) => {
      const flags = (c.recruiter_assessment?.["red_flags"] as string[] | undefined) ?? [];
      if (flags.length === 0) return <span className="text-[11px] text-slate-300">None</span>;
      return (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {flags.map((f) => (
            <span key={f} className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              {f}
            </span>
          ))}
        </div>
      );
    },
  },
];

const COLUMN_KEYS = COLUMN_DEFS.map((c) => c.key);

const DEFAULT_VISIBLE = new Set([
  "created_at",
  "origin",
  "email",
  "phone",
  "current_fixed_ctc",
  "total_experience_years",
  "current_job_title",
  "current_employer",
  "category",
  "current_industry",
  "previous_industries",
  "current_location",
  "role_level",
  "current_employment_status",
  "notice_period",
  "recommendation",
  "status",
  "resume",
]);

const STORAGE_KEY = "sa_candidates_columns_v1";

function loadPrefs(): { order: string[]; hidden: string[] } {
  const defaults = {
    order: COLUMN_KEYS,
    hidden: COLUMN_KEYS.filter((k) => !DEFAULT_VISIBLE.has(k)),
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as { order: string[]; hidden: string[] };
    // Guard against a stale saved list missing newly-added columns.
    const missing = COLUMN_KEYS.filter((k) => !parsed.order.includes(k));
    return { order: [...parsed.order.filter((k) => COLUMN_KEYS.includes(k)), ...missing], hidden: parsed.hidden ?? [] };
  } catch {
    return defaults;
  }
}

export type MandateLink = { mandate_id: string; role_title: string; client_name: string };

export default function CandidatesTable({
  candidates,
  openMandates,
  mandateLinksByCandidate = {},
}: {
  candidates: CandidateRow[];
  openMandates: OpenMandate[];
  mandateLinksByCandidate?: Record<string, MandateLink[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Carried onto each candidate's detail-page link so it can rebuild this
  // exact filtered list to offer prev/next navigation without a list --
  // see candidates/[id]/page.tsx.
  const fromQS = searchParams.toString();
  const supabase = createClient();
  const [order, setOrder] = useState<string[]>(COLUMN_KEYS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [summaryTooltip, setSummaryTooltip] = useState<{
    text: string;
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  function handleNameHover(e: MouseEvent<HTMLDivElement>, summary: string | null) {
    if (!summary) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const estTooltipHeight = 120;
    const tooltipWidth = 320;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceAbove >= estTooltipHeight || spaceAbove > spaceBelow;

    let left = rect.left;
    const maxLeft = window.innerWidth - tooltipWidth - 12;
    if (left > maxLeft) left = Math.max(12, maxLeft);

    setSummaryTooltip({
      text: summary,
      left,
      top: showAbove ? undefined : rect.bottom + 6,
      bottom: showAbove ? window.innerHeight - rect.top + 6 : undefined,
    });
  }

  function handleNameLeave() {
    setSummaryTooltip(null);
  }
  const [mandatePopoverFor, setMandatePopoverFor] = useState<string | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [chosenMandate, setChosenMandate] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  useEffect(() => {
    const prefs = loadPrefs();
    setOrder(prefs.order);
    setHidden(new Set(prefs.hidden));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, hidden: Array.from(hidden) }));
  }, [order, hidden, ready]);

  const columnsByKey = useMemo(() => {
    const map = new Map<string, ColumnDef>();
    COLUMN_DEFS.forEach((c) => map.set(c.key, c));
    return map;
  }, []);

  const visibleColumns = order.filter((k) => !hidden.has(k)).map((k) => columnsByKey.get(k)!).filter(Boolean);

  function move(key: string, dir: -1 | 1) {
    setOrder((prev) => {
      const idx = prev.indexOf(key);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  function reorderTo(draggedKeyValue: string, targetKey: string) {
    if (draggedKeyValue === targetKey) return;
    setOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKeyValue);
      const targetIdx = next.indexOf(targetKey);
      next.splice(targetIdx, 0, draggedKeyValue);
      return next;
    });
  }

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetDefaults() {
    setOrder(COLUMN_KEYS);
    setHidden(new Set(COLUMN_KEYS.filter((k) => !DEFAULT_VISIBLE.has(k))));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.id))));
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkMessage(null);
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const confirmed = window.confirm(
      `Delete ${selected.size} candidate${selected.size === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!confirmed) return;
    setBulkBusy(true);
    setBulkMessage(null);
    const { error } = await supabase.from("candidates").delete().in("id", Array.from(selected));
    setBulkBusy(false);
    if (error) {
      setBulkMessage(`Failed to delete: ${error.message}`);
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkMap() {
    if (!chosenMandate || selected.size === 0) return;
    setBulkBusy(true);
    setBulkMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rows = Array.from(selected).map((candidate_id) => ({
      candidate_id,
      mandate_id: chosenMandate,
      added_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("candidate_mandate_links").upsert(rows, {
      onConflict: "candidate_id,mandate_id",
      ignoreDuplicates: true,
    });
    setBulkBusy(false);
    if (error) {
      setBulkMessage(`Failed to map: ${error.message}`);
      return;
    }
    setMapModalOpen(false);
    setChosenMandate("");
    setBulkMessage(`Mapped ${rows.length} candidate${rows.length === 1 ? "" : "s"} to the mandate.`);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkInvite() {
    if (selected.size === 0) return;
    const targets = candidates.filter(
      (c) => selected.has(c.id) && (c.status === "awaiting_input" || c.status === "lead")
    );
    const skipped = selected.size - targets.length;
    if (targets.length === 0) {
      setBulkMessage("None of the selected candidates have an incomplete profile, so no invites were sent.");
      return;
    }
    setBulkBusy(true);
    setBulkMessage(null);
    let sent = 0;
    let failed = 0;
    for (const c of targets) {
      try {
        const res = await fetch("/api/send-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId: c.id }),
        });
        if (res.ok) sent += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    setBulkMessage(
      `Sent ${sent} invite${sent === 1 ? "" : "s"}.` +
        (failed ? ` ${failed} failed.` : "") +
        (skipped ? ` ${skipped} skipped (not Awaiting Input).` : "")
    );
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-ros-lg overflow-visible shadow-ros-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 relative">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" /> Customize columns
        </button>

        {panelOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />
            <div className="absolute right-4 top-11 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">Columns</p>
                <button onClick={() => setPanelOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                Show/hide and reorder — saved to this browser only.
              </p>
              <div className="max-h-80 overflow-y-auto space-y-0.5">
                {order.map((key, i) => {
                  const col = columnsByKey.get(key);
                  if (!col) return null;
                  const isHidden = hidden.has(key);
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => setDraggedKey(key)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedKey) reorderTo(draggedKey, key);
                        setDraggedKey(null);
                      }}
                      onDragEnd={() => setDraggedKey(null)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing ${
                        isHidden ? "opacity-40" : ""
                      } ${draggedKey === key ? "opacity-30" : ""} hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggle(key)}
                        className="shrink-0"
                      />
                      <span className="text-[12px] text-slate-700 dark:text-slate-300 flex-1 truncate">{col.label}</span>
                      <button
                        onClick={() => move(key, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-20 shrink-0"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => move(key, 1)}
                        disabled={i === order.length - 1}
                        className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-20 shrink-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={resetDefaults}
                className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 w-full"
              >
                <RotateCcw className="w-3 h-3" /> Reset to default
              </button>
            </div>
          </>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
          <p className="text-[12px] font-semibold text-blue-800">{selected.size} selected</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBulkInvite}
            disabled={bulkBusy}
            icon={bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendIcon className="w-3.5 h-3.5" />}
          >
            Send profile completion emails
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMapModalOpen(true)}
            disabled={bulkBusy || openMandates.length === 0}
            icon={<Link2 className="w-3.5 h-3.5" />}
            title={openMandates.length === 0 ? "No open mandates" : undefined}
          >
            Map with a mandate
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkBusy}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            className="!bg-white dark:bg-slate-900 !text-red-600 ring-1 ring-red-200 hover:!bg-red-50"
          >
            Delete
          </Button>
          <button onClick={clearSelection} className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 ml-auto">
            Clear selection
          </button>
        </div>
      )}

      {bulkMessage && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{bulkMessage}</p>
        </div>
      )}

      {mapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setMapModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">Map {selected.size} candidate{selected.size === 1 ? "" : "s"} to a mandate</h3>
            <p className="text-[12px] text-slate-400 mb-3">They'll appear on that mandate's page, sourced stage.</p>
            <select
              value={chosenMandate}
              onChange={(e) => setChosenMandate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] mb-3"
            >
              <option value="">Select an open mandate...</option>
              {openMandates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.role_title} — {m.client_name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setMapModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[13px] font-medium py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkMap}
                disabled={!chosenMandate || bulkBusy}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium py-2 disabled:opacity-50"
              >
                {bulkBusy ? "Mapping..." : "Map"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 w-8 sticky left-0 top-14 z-30 bg-slate-50 dark:bg-slate-800/50">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === candidates.length}
                  onChange={toggleAll}
                  className="rounded accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros"
                />
              </th>
              <th className="text-left px-4 py-2.5 font-semibold whitespace-nowrap sticky left-[52px] top-14 z-30 bg-slate-50 dark:bg-slate-800/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Name</th>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-4 py-2.5 font-semibold whitespace-nowrap sticky top-14 z-20 bg-slate-50 dark:bg-slate-800/50"
                >
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-2.5 sticky top-14 z-20 bg-slate-50 dark:bg-slate-800/50" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map((c) => (
              <tr
                key={c.id}
                className={`group hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-all duration-200 ease-ros ${
                  selected.has(c.id) ? "bg-blue-50/50 ring-1 ring-inset ring-blue-500/20" : ""
                }`}
              >
                <td className={`px-4 py-3 sticky left-0 z-10 ${selected.has(c.id) ? "bg-blue-50/50" : "bg-white dark:bg-slate-900 group-hover:bg-slate-50/70 dark:group-hover:bg-slate-800/70"}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleRow(c.id)}
                    className="rounded accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros"
                  />
                </td>
                <td className={`px-4 py-3 sticky left-[52px] ${mandatePopoverFor === c.id ? "z-40" : "z-10"} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${selected.has(c.id) ? "bg-blue-50/50" : "bg-white dark:bg-slate-900 group-hover:bg-slate-50/70 dark:group-hover:bg-slate-800/70"}`}>
                  <div
                    className="relative"
                    onMouseEnter={(e) => handleNameHover(e, c.ai_summary)}
                    onMouseLeave={handleNameLeave}
                  >
                    <Link
                      href={fromQS ? `/candidates/${c.id}?from=${encodeURIComponent(fromQS)}` : `/candidates/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      {/* One calm, neutral avatar treatment for everyone --
                          category is already its own column, so color-coding
                          the avatar too was pure noise, not signal (10 rows,
                          10 different gradient hues, no consistent meaning
                          a recruiter could actually read at a glance). */}
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200/60 flex items-center justify-center text-[11px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                        {initialsFor(c.full_name)}
                      </div>
                      <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-all duration-200 ease-ros truncate whitespace-nowrap">
                        {c.full_name}
                      </p>
                    </Link>
                    {(mandateLinksByCandidate[c.id] ?? []).length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMandatePopoverFor(mandatePopoverFor === c.id ? null : c.id);
                        }}
                        className="absolute -top-1.5 left-4 flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-semibold shadow-sm hover:bg-blue-500 transition-colors duration-200 ease-ros"
                        title="Mandates this candidate is linked to"
                      >
                        {(mandateLinksByCandidate[c.id] ?? []).length}
                      </button>
                    )}
                    {mandatePopoverFor === c.id && (
                      <div
                        className="absolute z-30 top-full left-0 mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2"
                        onMouseLeave={() => setMandatePopoverFor(null)}
                      >
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide px-1.5 pb-1">
                          Applied / linked to
                        </p>
                        {(mandateLinksByCandidate[c.id] ?? []).map((m) => (
                          <Link
                            key={m.mandate_id}
                            href={`/mandates/${m.mandate_id}`}
                            className="block rounded-md px-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
                          >
                            <p className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200 truncate">{m.role_title}</p>
                            <p className="text-[11px] text-slate-400 truncate">{m.client_name}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                {visibleColumns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render(c)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <Link
                    href={fromQS ? `/candidates/${c.id}?from=${encodeURIComponent(fromQS)}` : `/candidates/${c.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-200 ease-ros inline-flex items-center gap-1 text-[12px] text-blue-600 font-medium whitespace-nowrap"
                  >
                    View <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {candidates.length === 0 && (
        <EmptyState
          className="border-0 shadow-none py-16"
          title="No candidates match these filters"
          action={
            <Link href="/candidates" className="text-[13px] text-blue-600 hover:underline">
              Clear filters
            </Link>
          }
        />
      )}

      {summaryTooltip && (
        <div
          className="fixed z-50 w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400 shadow-lg pointer-events-none"
          style={{ left: summaryTooltip.left, top: summaryTooltip.top, bottom: summaryTooltip.bottom }}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600">AI summary</p>
          {summaryTooltip.text}
        </div>
      )}
    </div>
  );
}
