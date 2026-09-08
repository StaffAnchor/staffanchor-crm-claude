"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { applyStageChange } from "@/lib/mandate-stage";

export type PlacementRow = {
  linkId: string;
  candidateId: string;
  mandateId: string;
  candidateName: string;
  ownerId: string | null;
  roleTitle: string;
  clientName: string;
  hasClientLink: boolean;
  feePercentage: number | null;
  dateOfJoining: string | null;
  offeredFixedCtc: number | null;
  fallbackCtc: number | null; // candidate's expected/current CTC, used if Offered CTC isn't set yet
  joinStatus: string | null; // null = awaiting confirmation
  joinStatusUpdatedAt: string | null;
  stageUpdatedAt: string;
};

const JOIN_STATUS_TONE: Record<string, string> = {
  joined_on_time: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  joined_postponed: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  did_not_join: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400",
};

const GST_RATE = 0.18;

function inr(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Effective CTC this placement bills against -- the placement-specific
// Offered CTC when an admin has set one, else the candidate's general
// expected/current CTC as a fallback so billing isn't just blank for
// every placement made before this field existed.
function effectiveCtc(row: PlacementRow): number | null {
  return row.offeredFixedCtc ?? row.fallbackCtc;
}

function billingBreakdown(row: PlacementRow): { ctc: number; fee: number; billing: number; gst: number; total: number } | null {
  const ctc = effectiveCtc(row);
  if (ctc == null || row.feePercentage == null) return null;
  const billing = (ctc * row.feePercentage) / 100;
  const gst = billing * GST_RATE;
  return { ctc, fee: row.feePercentage, billing, gst, total: billing + gst };
}

export default function PlacementsView({
  initialRows,
  fetchError,
  isAdmin,
  currentUserId,
}: {
  initialRows: PlacementRow[];
  fetchError: string | null;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dojDrafts, setDojDrafts] = useState<Record<string, string>>({});
  const [ctcDrafts, setCtcDrafts] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "awaiting" | "joined_on_time" | "joined_postponed" | "did_not_join">("all");

  const totals = useMemo(() => {
    let awaiting = 0;
    let finalBilling = 0;
    let missingBillingInputs = 0;
    for (const r of rows) {
      if (!r.joinStatus) awaiting++;
      const b = billingBreakdown(r);
      if (b) finalBilling += b.total;
      else missingBillingInputs++;
    }
    return { total: rows.length, awaiting, finalBilling, missingBillingInputs };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "awaiting") return rows.filter((r) => !r.joinStatus);
    return rows.filter((r) => r.joinStatus === statusFilter);
  }, [rows, statusFilter]);

  async function saveJoiningDate(row: PlacementRow) {
    const next = dojDrafts[row.linkId];
    if (!next || next === row.dateOfJoining) return;
    setSavingId(row.linkId);
    setMessage(null);
    try {
      await applyStageChange(supabase, {
        linkId: row.linkId,
        candidateId: row.candidateId,
        mandateId: row.mandateId,
        candidateName: row.candidateName,
        mandateLabel: `${row.roleTitle} — ${row.clientName}`,
        previousStage: "placed",
        newStage: "placed",
        source: "recruiter",
        dateOfJoining: next,
        existingDateOfJoining: row.dateOfJoining,
      });
      setRows((prev) => prev.map((r) => (r.linkId === row.linkId ? { ...r, dateOfJoining: next } : r)));
      setDojDrafts((prev) => {
        const copy = { ...prev };
        delete copy[row.linkId];
        return copy;
      });
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to save joining date." });
    } finally {
      setSavingId(null);
    }
  }

  async function saveJoinStatus(row: PlacementRow, status: string) {
    setSavingId(row.linkId);
    setMessage(null);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("candidate_mandate_links")
      .update({ join_status: status || null, join_status_updated_by: currentUserId, join_status_updated_at: nowIso })
      .eq("id", row.linkId);
    setSavingId(null);
    if (error) {
      setMessage({ type: "error", text: `Couldn't save confirmation: ${error.message}` });
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.linkId === row.linkId ? { ...r, joinStatus: status || null, joinStatusUpdatedAt: nowIso } : r))
    );
  }

  async function saveOfferedCtc(row: PlacementRow) {
    const raw = ctcDrafts[row.linkId];
    if (raw === undefined) return;
    const parsed = raw.trim() === "" ? null : Number(raw);
    if (raw.trim() !== "" && (Number.isNaN(parsed) || (parsed as number) < 0)) {
      setMessage({ type: "error", text: "Offered CTC must be a positive number." });
      return;
    }
    setSavingId(row.linkId);
    setMessage(null);
    const { error } = await supabase.rpc("admin_set_offered_ctc", { p_link_id: row.linkId, p_offered_ctc: parsed });
    setSavingId(null);
    if (error) {
      setMessage({ type: "error", text: `Couldn't save Offered CTC: ${error.message}` });
      return;
    }
    setRows((prev) => prev.map((r) => (r.linkId === row.linkId ? { ...r, offeredFixedCtc: parsed } : r)));
    setCtcDrafts((prev) => {
      const copy = { ...prev };
      delete copy[row.linkId];
      return copy;
    });
    router.refresh();
  }

  return (
    <div>
      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-ros-md text-xs font-medium ${
            message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}
      {fetchError && (
        <div className="mb-4 px-4 py-2 rounded-ros-md text-xs font-medium bg-red-50 text-red-700">Couldn&apos;t load placements: {fetchError}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Total placed</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">{totals.total}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Awaiting confirmation</p>
          <p className="text-lg font-bold text-amber-600 mt-0.5">{totals.awaiting}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Final billing value (incl. 18% GST)</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">{inr(totals.finalBilling)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Missing CTC / billing % </p>
          <p className="text-lg font-bold text-rose-600 mt-0.5">{totals.missingBillingInputs}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        {(
          [
            { key: "all", label: "All" },
            { key: "awaiting", label: "Awaiting confirmation" },
            { key: "joined_on_time", label: "Joined on time" },
            { key: "joined_postponed", label: "Postponed" },
            { key: "did_not_join", label: "Did not join" },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
              statusFilter === f.key
                ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10.5px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Candidate</th>
              <th className="text-left px-3 py-2">Client</th>
              <th className="text-left px-3 py-2">Mandate</th>
              <th className="text-left px-3 py-2">Joining date</th>
              <th className="text-left px-3 py-2">Confirmation</th>
              <th className="text-left px-3 py-2">Offered CTC</th>
              <th className="text-left px-3 py-2">Billing % </th>
              <th className="text-left px-3 py-2">Billing value</th>
              <th className="text-left px-3 py-2">GST (18%)</th>
              <th className="text-left px-3 py-2">Final billing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleRows.map((row) => {
              const breakdown = billingBreakdown(row);
              const dojDraft = dojDrafts[row.linkId] ?? row.dateOfJoining ?? "";
              const dojDirty = dojDraft !== (row.dateOfJoining ?? "");
              const ctcDraft = ctcDrafts[row.linkId] ?? (row.offeredFixedCtc != null ? String(row.offeredFixedCtc) : "");
              const ctcDirty = ctcDraft !== (row.offeredFixedCtc != null ? String(row.offeredFixedCtc) : "");
              const usingFallbackCtc = row.offeredFixedCtc == null && row.fallbackCtc != null;
              return (
                <tr key={row.linkId} className="align-top">
                  <td className="px-3 py-2.5">
                    <Link href={`/candidates/${row.candidateId}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      {row.candidateName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                    {row.clientName}
                    {!row.hasClientLink && (
                      <div className="text-[10.5px] text-rose-500 mt-0.5">Mandate not linked to a client record — billing can&apos;t compute</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                    <Link href={`/mandates/${row.mandateId}`} className="hover:text-blue-600 hover:underline">
                      {row.roleTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={dojDraft}
                        onChange={(e) => setDojDrafts((prev) => ({ ...prev, [row.linkId]: e.target.value }))}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-1 text-[12px]"
                      />
                      {dojDirty && (
                        <button
                          onClick={() => saveJoiningDate(row)}
                          disabled={savingId === row.linkId}
                          className="text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40"
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={row.joinStatus ?? ""}
                      onChange={(e) => saveJoinStatus(row, e.target.value)}
                      disabled={savingId === row.linkId}
                      className={`rounded-full text-[11.5px] font-medium px-2 py-1 border-0 disabled:opacity-40 ${
                        row.joinStatus ? JOIN_STATUS_TONE[row.joinStatus] : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      <option value="">Awaiting confirmation</option>
                      <option value="joined_on_time">Joined on time</option>
                      <option value="joined_postponed">Joined — date postponed</option>
                      <option value="did_not_join">Did not join</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    {isAdmin ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          placeholder={row.fallbackCtc != null ? String(row.fallbackCtc) : "—"}
                          value={ctcDraft}
                          onChange={(e) => setCtcDrafts((prev) => ({ ...prev, [row.linkId]: e.target.value }))}
                          className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-1 text-[12px]"
                        />
                        {ctcDirty && (
                          <button
                            onClick={() => saveOfferedCtc(row)}
                            disabled={savingId === row.linkId}
                            className="text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40"
                          >
                            Save
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300">
                        {row.offeredFixedCtc != null ? inr(row.offeredFixedCtc) : usingFallbackCtc ? `${inr(row.fallbackCtc)} (est.)` : "—"}
                      </span>
                    )}
                    {isAdmin && usingFallbackCtc && (
                      <div className="text-[10.5px] text-amber-600 mt-0.5">Not set — using candidate&apos;s expected CTC as estimate</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                    {row.feePercentage != null ? `${row.feePercentage}%` : <span className="text-rose-500">Not set</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{breakdown ? inr(breakdown.billing) : "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{breakdown ? inr(breakdown.gst) : "—"}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{breakdown ? inr(breakdown.total) : "—"}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-400 text-[12.5px]">
                  No placements in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
