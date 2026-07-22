"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageCircleQuestion, Loader2, Mail } from "lucide-react";
import MandateScreeningPanel, { type MandateScreeningContext } from "./mandate-screening-panel";
import { STAGES, applyStageChange, type Stage, type StageSource } from "@/lib/mandate-stage";

const STAGE_COLOR: Record<string, string> = {
  sourced: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  screened: "bg-blue-100 text-blue-800",
  shortlisted: "bg-teal-100 text-teal-800",
  submitted: "bg-indigo-100 text-indigo-800",
  client_interview: "bg-cyan-100 text-cyan-800",
  client_shortlisted: "bg-purple-100 text-purple-800",
  offer: "bg-lime-100 text-lime-800",
  placed: "bg-green-100 text-green-800",
  pulled_back: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-700",
};

// Stage index used only to decide whether adding to the client shortlist
// should auto-advance stage -- never downgrades a candidate who's already
// further along (e.g. already at client_interview) back to "submitted".
const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});

export type MandateCandidateRow = {
  id: string;
  stage: string;
  in_shortlist: boolean;
  stage_source: StageSource | null;
  client_decision_at: string | null;
  rejected_from_stage: string | null;
  date_of_joining: string | null;
  screened: boolean;
  candidate: {
    id: string;
    full_name: string;
    email: string | null;
    category: string | null;
    sub_domain: string | null;
    total_experience_years: number | null;
    current_fixed_ctc: number | null;
    recruiter_assessment: Record<string, unknown> | null;
    work_mode: string | null;
    open_to_relocation: string | null;
    notice_period: string | null;
    segment_data: Record<string, unknown> | null;
    current_employer: string | null;
    career_timeline_resume: unknown;
    career_timeline_profile: unknown;
  };
};

export default function MandateCandidatesTable({
  rows: initialRows,
  mandateContext,
}: {
  rows: MandateCandidateRow[];
  mandateContext: MandateScreeningContext & { [key: string]: unknown };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [emailingJd, setEmailingJd] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [screeningRowId, setScreeningRowId] = useState<string | null>(null);
  // Which row is mid-edit on its stage select, and whether that edit is
  // being attributed to the client (vs. the recruiter's own call) --
  // separate from `rows` state since most rows are never being edited.
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [clientRelayed, setClientRelayed] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [savingStage, setSavingStage] = useState(false);

  function toggleRow(linkId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function saveStage(row: MandateCandidateRow, newStage: Stage) {
    setSavingStage(true);
    setMessage(null);
    try {
      const source: StageSource = clientRelayed ? "client_relayed" : "recruiter";
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage,
        source,
        rejectionReason: newStage === "rejected" ? rejectionReason : undefined,
        dateOfJoining: newStage === "placed" ? dateOfJoining : undefined,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: source } : r)));
      setEditingStageId(null);
      setClientRelayed(false);
      setRejectionReason("");
      setDateOfJoining("");
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to update stage." });
    } finally {
      setSavingStage(false);
    }
  }

  // Adding a candidate to the client shortlist and their pipeline stage are
  // the same real-world event from the client's point of view -- being put
  // in front of the client -- so this keeps stage in sync automatically
  // instead of leaving a recruiter to remember to also flip the Stage
  // dropdown. Only auto-advances (never downgrades someone already further
  // along, e.g. already at client_interview), and only auto-syncs this one
  // direction: manually setting Stage to "submitted" from the dropdown does
  // NOT add someone to the shortlist, since a recruiter might mark that for
  // other reasons (e.g. submitted outside this tool).
  async function syncStageForShortlist(row: MandateCandidateRow, addingToShortlist: boolean) {
    const newStage: Stage = addingToShortlist ? "submitted" : "pulled_back";
    if (addingToShortlist && (STAGE_ORDER[row.stage] ?? 0) >= STAGE_ORDER["submitted"]) return; // already further along, don't downgrade
    if (!addingToShortlist && row.stage === "pulled_back") return; // already pulled back

    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage,
        source: "recruiter",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: "recruiter" } : r)));
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to sync stage with shortlist status." });
    }
  }

  async function toggleShortlist(linkId: string, next: boolean) {
    const row = rows.find((r) => r.id === linkId);
    setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: next } : r)));
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: next }).eq("id", linkId);
    if (error) {
      setMessage({ type: "error", text: error.message });
      setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: !next } : r)));
      return;
    }
    if (row) await syncStageForShortlist(row, next);
    router.refresh();
  }

  async function handleBulkShortlist() {
    setBusy(true);
    setMessage(null);
    const ids = Array.from(selected);
    const targetRows = rows.filter((r) => ids.includes(r.id));
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: true }).in("id", ids);
    if (error) {
      setBusy(false);
      setMessage({ type: "error", text: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, in_shortlist: true } : r)));
    await Promise.all(targetRows.map((row) => syncStageForShortlist(row, true)));
    setBusy(false);
    setSelected(new Set());
    setMessage({ type: "success", text: `Moved ${ids.length} candidate${ids.length === 1 ? "" : "s"} to the client shortlist and set stage to submitted.` });
    router.refresh();
  }

  async function handleEmailJd() {
    setEmailingJd(true);
    setMessage(null);
    const candidateIds = Array.from(selected)
      .map((linkId) => rows.find((r) => r.id === linkId)?.candidate.id)
      .filter((v): v is string => Boolean(v));
    try {
      const res = await fetch(`/api/mandates/${mandateContext.mandateId}/email-jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to email the JD.");
      const sentCount = data.sent?.length ?? 0;
      const failedCount = data.failed?.length ?? 0;
      setMessage({
        type: failedCount > 0 && sentCount === 0 ? "error" : "success",
        text:
          `JD emailed to ${sentCount} candidate${sentCount === 1 ? "" : "s"}.` +
          (failedCount > 0
            ? ` ${failedCount} failed (${data.failed.map((f: { name: string; reason: string }) => `${f.name}: ${f.reason}`).join(", ")}).`
            : ""),
      });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to email the JD." });
    } finally {
      setEmailingJd(false);
    }
  }

  async function handleBulkUnlink() {
    if (!window.confirm(`Remove ${selected.size} candidate(s) from this mandate? This does not delete their profile.`)) return;
    setBusy(true);
    setMessage(null);
    const ids = Array.from(selected);
    const { error } = await supabase.from("candidate_mandate_links").delete().in("id", ids);
    setBusy(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    setMessage({ type: "success", text: `Removed ${ids.length} candidate${ids.length === 1 ? "" : "s"} from this mandate.` });
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mt-6 shadow-sm">
      {message && (
        <div className={`px-4 py-2 text-xs font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2.5 text-sm text-white">
          <span>{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkShortlist}
              disabled={busy}
              className="rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
            >
              Move to client shortlist
            </button>
            <button
              onClick={handleEmailJd}
              disabled={emailingJd}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
              title="Emails the JD PDF to each selected candidate's email on file"
            >
              {emailingJd ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Email JD
            </button>
            <button
              onClick={handleBulkUnlink}
              disabled={busy}
              className="rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
            >
              Reject / remove from mandate
            </button>
            <button onClick={() => setSelected(new Set())} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs">
              Clear
            </button>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5 w-8">
              <input
                type="checkbox"
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={toggleAll}
              />
            </th>
            <th className="text-left px-4 py-2.5">Candidate</th>
            <th className="text-left px-4 py-2.5">Fixed CTC</th>
            <th className="text-left px-4 py-2.5">Recommendation</th>
            <th className="text-left px-4 py-2.5">Screening</th>
            <th className="text-left px-4 py-2.5">Stage</th>
            <th className="text-left px-4 py-2.5">In client shortlist</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
              <td className="px-4 py-3">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/candidates/${l.candidate.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600">
                  {l.candidate.full_name}
                </Link>
                <div className="text-xs text-slate-400">{l.candidate.sub_domain}</div>
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {l.candidate.current_fixed_ctc ? `₹${l.candidate.current_fixed_ctc}L` : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {(l.candidate.recruiter_assessment?.["overall_recommendation"] as string) ?? "Not assessed"}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => setScreeningRowId(l.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${
                    l.screened
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  }`}
                >
                  <MessageCircleQuestion className="w-3 h-3" />
                  {l.screened ? "Screened" : "Screen"}
                </button>
              </td>
              <td className="px-4 py-3">
                {editingStageId === l.id ? (
                  <div className="flex flex-col gap-1.5 min-w-[160px]">
                    <select
                      defaultValue={l.stage}
                      autoFocus
                      onChange={(e) => saveStage(l, e.target.value as Stage)}
                      disabled={savingStage}
                      className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <input type="checkbox" checked={clientRelayed} onChange={(e) => setClientRelayed(e.target.checked)} />
                      Client told us this
                    </label>
                    <input
                      type="text"
                      placeholder="Rejection reason (if rejected)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                    />
                    <input
                      type="date"
                      title="Date of joining (if placed)"
                      value={dateOfJoining}
                      onChange={(e) => setDateOfJoining(e.target.value)}
                      className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                    />
                    <button
                      onClick={() => {
                        setEditingStageId(null);
                        setClientRelayed(false);
                        setRejectionReason("");
                        setDateOfJoining("");
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-600 text-left"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingStageId(l.id)}
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${STAGE_COLOR[l.stage] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}
                  >
                    {l.stage_source && l.stage_source !== "recruiter" && "🔔 "}
                    {l.stage.replace(/_/g, " ")}
                  </button>
                )}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggleShortlist(l.id, !l.in_shortlist)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    l.in_shortlist ? "bg-teal-100 text-teal-800 hover:bg-teal-200" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {l.in_shortlist ? "Yes — click to remove" : "No — click to add"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
          No candidates linked yet. Link candidates from their profile page.
        </p>
      )}

      {screeningRowId && (() => {
        const row = rows.find((r) => r.id === screeningRowId);
        if (!row) return null;
        return (
          <MandateScreeningPanel
            open={true}
            onClose={() => setScreeningRowId(null)}
            candidate={row.candidate}
            mandateContext={mandateContext}
            onSaved={() => {
              setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, screened: true } : r)));
              router.refresh();
            }}
          />
        );
      })()}
    </div>
  );
}
