"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STAGE_COLOR: Record<string, string> = {
  sourced: "bg-slate-100 text-slate-700",
  screened: "bg-blue-100 text-blue-800",
  shortlisted: "bg-teal-100 text-teal-800",
  submitted: "bg-indigo-100 text-indigo-800",
  client_interview: "bg-cyan-100 text-cyan-800",
  offer: "bg-lime-100 text-lime-800",
  placed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

export type MandateCandidateRow = {
  id: string;
  stage: string;
  in_shortlist: boolean;
  candidate: {
    id: string;
    full_name: string;
    category: string | null;
    sub_domain: string | null;
    total_experience_years: number | null;
    current_fixed_ctc: number | null;
    recruiter_assessment: Record<string, unknown> | null;
  };
};

export default function MandateCandidatesTable({ rows: initialRows }: { rows: MandateCandidateRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  async function toggleShortlist(linkId: string, next: boolean) {
    setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: next } : r)));
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: next }).eq("id", linkId);
    if (error) {
      setMessage({ type: "error", text: error.message });
      setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: !next } : r)));
    }
  }

  async function handleBulkShortlist() {
    setBusy(true);
    setMessage(null);
    const ids = Array.from(selected);
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: true }).in("id", ids);
    setBusy(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, in_shortlist: true } : r)));
    setSelected(new Set());
    setMessage({ type: "success", text: `Moved ${ids.length} candidate${ids.length === 1 ? "" : "s"} to the client shortlist.` });
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
            <th className="text-left px-4 py-2.5">Stage</th>
            <th className="text-left px-4 py-2.5">In client shortlist</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/candidates/${l.candidate.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600">
                  {l.candidate.full_name}
                </Link>
                <div className="text-xs text-slate-400">{l.candidate.sub_domain}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {l.candidate.current_fixed_ctc ? `₹${l.candidate.current_fixed_ctc}L` : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {(l.candidate.recruiter_assessment?.["overall_recommendation"] as string) ?? "Not assessed"}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLOR[l.stage] ?? "bg-slate-100 text-slate-700"}`}>
                  {l.stage.replace(/_/g, " ")}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggleShortlist(l.id, !l.in_shortlist)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    l.in_shortlist ? "bg-teal-100 text-teal-800 hover:bg-teal-200" : "bg-slate-100 text-slate-500 dark:text-slate-400 hover:bg-slate-200"
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
    </div>
  );
}
