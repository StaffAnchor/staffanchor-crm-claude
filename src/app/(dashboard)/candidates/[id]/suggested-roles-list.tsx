"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, HelpCircle, Loader2, Sparkles, X } from "lucide-react";

type Req = { requirement: string; status: "met" | "doubt" | "missing"; evidence: string | null; question: string | null };
export type RoleSuggestion = {
  mandateId: string;
  roleTitle: string;
  clientName: string | null;
  where: string;
  fit: "strong" | "possible" | "weak";
  score: number;
  summary: string | null;
  checks: { must: Req[]; good: Req[]; experience: string; location: string };
};

const FIT: Record<RoleSuggestion["fit"], { label: string; cls: string }> = {
  strong: { label: "Strong fit", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  possible: { label: "Possible fit", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  weak: { label: "Weak fit", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};
const REASONS = ["Wrong domain or motion", "Experience doesn't fit", "Compensation doesn't fit", "Location doesn't fit", "Other"];

function ReqChip({ c }: { c: Req }) {
  const cls =
    c.status === "met"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
      : c.status === "missing"
        ? "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
        : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  const Icon = c.status === "met" ? Check : c.status === "missing" ? X : HelpCircle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ${cls}`} title={c.evidence ?? c.question ?? ""}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="max-w-[200px] truncate">{c.requirement}</span>
    </span>
  );
}

function Row({ s, candidateId, onDone }: { s: RoleSuggestion; candidateId: string; onDone: () => void }) {
  const [busy, setBusy] = useState<"add" | "dismiss" | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const f = FIT[s.fit];

  async function decide(action: "add" | "dismiss") {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/mandates/${s.mandateId}/ai-match/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, action, reason: action === "dismiss" ? reason : undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(d.error ?? "That didn't work. Try again.");
    onDone();
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/mandates/${s.mandateId}`} className="text-[14px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
              {s.roleTitle}
            </Link>
            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${f.cls}`}>{f.label}</span>
            <span className="text-[12px] tabular-nums text-slate-500">{s.score}/100</span>
          </div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{[s.clientName, s.where].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setDismissing((d) => !d)} disabled={busy !== null} className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Not a fit
          </button>
          <button onClick={() => decide("add")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {busy === "add" && <Loader2 className="h-3 w-3 animate-spin" />} Add to pipeline
          </button>
        </div>
      </div>
      {s.summary && <p className="mt-2 text-[13px] text-slate-700 dark:text-slate-300">{s.summary}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.checks.must.map((c, i) => (
          <ReqChip key={`m${i}`} c={c} />
        ))}
      </div>
      {(s.checks.experience === "below" || s.checks.experience === "above" || s.checks.location === "other" || s.checks.location === "relocate") && (
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          {[
            s.checks.experience === "below" ? "Below the experience asked" : s.checks.experience === "above" ? "Above the experience asked" : null,
            s.checks.location === "other" ? "Based elsewhere" : s.checks.location === "relocate" ? "Based elsewhere, open to relocate" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {dismissing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-900">
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button onClick={() => decide("dismiss")} disabled={busy !== null} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {busy === "dismiss" ? "Saving..." : "Confirm"}
          </button>
          <span className="text-[11.5px] text-slate-500">They stay in the bank for other roles.</span>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </li>
  );
}

export default function SuggestedRolesList({ candidateId, items, openRoles, hasCv }: { candidateId: string; items: RoleSuggestion[]; openRoles: number; hasCv: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/suggested-roles/check`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Couldn't check the open roles. Try again.");
      else {
        const parts: string[] = [];
        if (d.checked > 0) parts.push(`checked ${d.checked} open role${d.checked === 1 ? "" : "s"}`);
        if (d.reused > 0) parts.push(`${d.reused} already up to date`);
        if (d.eligible === 0) parts.push("no other open role has must-haves set, or they are already in each pipeline");
        if (d.remaining > 0) parts.push(`${d.remaining} more to check: press again`);
        if (d.failed?.length) parts.push(`${d.failed.length} could not be read`);
        setMessage(parts.length ? `${parts[0].charAt(0).toUpperCase()}${parts.join(", ").slice(1)}.` : "Nothing new to check.");
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            <Sparkles className="h-4 w-4 text-violet-600" aria-hidden /> Roles that may suit this person
          </h2>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
            Open roles whose must-haves are checked against this CV, with the evidence. A doubt is something to confirm with them, not a no. They are not in any pipeline until you add them.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running || !hasCv || openRoles === 0}
          title={!hasCv ? "This profile has no CV to check yet" : undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {running ? "Checking..." : items.length > 0 ? "Check more open roles" : "Check against open roles"}
        </button>
      </div>
      {!hasCv && <p className="mb-3 text-[13px] text-amber-800 dark:text-amber-300">Add a CV to this profile first. Matching reads the CV.</p>}
      {message && <p className="mb-3 text-[13px] text-slate-700 dark:text-slate-300">{message}</p>}
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      {items.length === 0 ? (
        <p className="py-6 text-[13px] text-slate-500 dark:text-slate-400">
          {openRoles === 0 ? "There are no open roles right now." : "No suggestions yet. Press the button to check this person against your open roles."}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <Row key={s.mandateId} s={s} candidateId={candidateId} onDone={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}
