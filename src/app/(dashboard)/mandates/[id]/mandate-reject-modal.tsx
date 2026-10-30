"use client";

import { useEffect, useMemo, useState } from "react";
import { X, UserX, Building2, Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RatingPicker, emptyDraft, saveProfileRating, type RatingDraft } from "@/components/profile-rating";
import { saveSalesFlags } from "@/components/sales-flags-panel";
import { CATEGORY_LABEL, NOT_A_FIT_REASONS } from "@/lib/not-a-fit-reasons";
import { RECRUITER_REJECTION_REASONS, CLIENT_REJECTION_REASONS, type StageSource } from "@/lib/mandate-stage";

// Replaces the old single "Rejected" dropdown option + easy-to-miss "Client
// told us this" checkbox + optional free-text box. That combination is
// exactly what produced the confusion the user flagged: candidates the
// recruiter themselves passed on were showing up looking like client
// rejections (or vice versa) because attribution was one unchecked
// checkbox away from being wrong, and a reason was never required at all.
// This modal makes the two flows physically distinct buttons up front, and
// won't let a rejection through without a category picked from the list
// that's actually true for whoever made the call.
export default function MandateRejectModal({
  candidateName,
  candidateId,
  mandateId,
  onCancel,
  onConfirm,
  submitting = false,
}: {
  candidateName: string;
  // When given, the window also asks for an overall CV rating and saves it
  // on the candidate (separate from the role-specific reason above).
  candidateId?: string;
  mandateId?: string;
  onCancel: () => void;
  onConfirm: (result: { source: Extract<StageSource, "recruiter" | "client_relayed">; category: string; note: string }) => void;
  submitting?: boolean;
}) {
  const [source, setSource] = useState<"recruiter" | "client_relayed" | null>(null);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<RatingDraft>(emptyDraft);
  const [sellerFlags, setSellerFlags] = useState<string[]>([]);

  const baseReasons = source === "recruiter" ? RECRUITER_REJECTION_REASONS : CLIENT_REJECTION_REASONS;

  // What the CV and the role already say, and whether anyone has actually spoken to this person.
  type Hint = { value: string; label: string; evidence: string; strength: number };
  const [hints, setHints] = useState<Hint[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [spoken, setSpoken] = useState<boolean | null>(null);
  const [cvOnly, setCvOnly] = useState(true);
  useEffect(() => {
    if (source !== "recruiter" || !candidateId || !mandateId) return;
    let live = true;
    fetch(`/api/mandates/${mandateId}/reject-hints?candidateId=${candidateId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { hints: Hint[]; usage: Record<string, number>; spoken: boolean } | null) => {
        if (!live || !d) return;
        setHints(d.hints ?? []);
        setUsage(d.usage ?? {});
        setSpoken(d.spoken);
        setCvOnly(!d.spoken);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [source, candidateId, mandateId]);

  // Reasons the CV points to first, then the ones used most, "Other" last.
  const reasons = useMemo(() => {
    const suggested = new Set(hints.map((h) => h.value));
    return [...baseReasons].sort((a, b) => {
      const other = (v: string) => (v.startsWith("other") ? 1 : 0);
      return other(a.value) - other(b.value) || Number(suggested.has(b.value)) - Number(suggested.has(a.value)) || (usage[b.value] ?? 0) - (usage[a.value] ?? 0);
    });
  }, [baseReasons, hints, usage]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Reject {candidateName}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!source ? (
          <div className="p-4 space-y-2">
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mb-2">
              Who&apos;s making this call? This decides which reason list you&apos;ll pick from, and how it&apos;s reported.
            </p>
            <button
              onClick={() => setSource("recruiter")}
              className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 text-left hover:border-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-colors"
            >
              <UserX className="w-5 h-5 text-teal-500 shrink-0" />
              <span>
                <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">We&apos;re passing</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Our own call -- never reached the client</span>
              </span>
            </button>
            <button
              onClick={() => setSource("client_relayed")}
              className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 text-left hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors"
            >
              <Building2 className="w-5 h-5 text-amber-500 shrink-0" />
              <span>
                <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">Client passed</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Client (or their portal) made this call</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <button onClick={() => setSource(null)} className="text-xs text-slate-400 hover:text-slate-600">
              ← Change who&apos;s rejecting
            </button>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Reason <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                autoFocus
                className="w-full text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 bg-white dark:bg-slate-900"
              >
                <option value="">Select a reason…</option>
                {reasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {hints.some((h) => h.value === r.value) ? "★ " : ""}
                    {r.label}
                  </option>
                ))}
              </select>
              {hints.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
                    <Sparkles className="h-3 w-3 text-teal-500" /> The CV points to
                  </p>
                  <div className="flex flex-col gap-1">
                    {hints.map((h) => (
                      <button
                        key={h.value}
                        type="button"
                        onClick={() => {
                          setCategory(h.value);
                          if (!note.trim()) setNote(h.evidence);
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 text-left text-[12px] ${category === h.value ? "border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30" : "border-slate-200 hover:border-teal-300 dark:border-slate-700"}`}
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-100">{h.label}</span>
                        <span className="block text-slate-500 dark:text-slate-400">{h.evidence}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {source === "recruiter" && (
              <label className="flex items-start gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={cvOnly} onChange={(e) => setCvOnly(e.target.checked)} className="mt-0.5" />
                <span>
                  I haven&apos;t spoken to them; this is from the CV only.
                  {spoken === true && <span className="block text-slate-400">A call with them is on record, so this is unticked for you.</span>}
                </span>
              </label>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Additional detail (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything specific worth remembering..."
                className="w-full text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 bg-white dark:bg-slate-900 resize-none"
              />
            </div>
            {candidateId && source === "recruiter" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  About how they sell? <span className="font-normal text-slate-400">(optional, remembered for other roles)</span>
                </label>
                <div className="space-y-1.5">
                  {["selling", "track", "people"].map((cat) => (
                    <div key={cat} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-full text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{CATEGORY_LABEL[cat]}</span>
                      {NOT_A_FIT_REASONS.filter((r) => r.scope === "person" && r.category === cat).map((r) => {
                        const on = sellerFlags.includes(r.value);
                        return (
                          <button
                            key={r.value}
                            type="button"
                            title={r.hint}
                            onClick={() => setSellerFlags((f) => (on ? f.filter((x) => x !== r.value) : [...f, r.value]))}
                            className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${on ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300" : "border-slate-200 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300"}`}
                          >
                            {r.title}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {candidateId && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Overall, how is this CV? <span className="font-normal text-slate-400">(optional, remembered for other roles)</span>
                </label>
                <RatingPicker draft={rating} onChange={setRating} strongLabel="Strong, wrong for this role" averageLabel="Average / skip" />
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onCancel} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (candidateId && rating.rating) {
                    void saveProfileRating(createClient(), candidateId, { rating: rating.rating, reasons: rating.reasons, note: rating.note }, mandateId);
                  }
                  if (candidateId && source === "recruiter" && sellerFlags.length > 0) void saveSalesFlags(candidateId, sellerFlags, mandateId);
                  // Whether this was decided from the CV alone or after a conversation is kept with the reason.
                  const basis = source === "recruiter" ? (cvOnly ? "CV only. " : "After a call. ") : "";
                  onConfirm({ source, category, note: `${basis}${note.trim()}`.trim() });
                }}
                disabled={!category || submitting}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3.5 py-1.5"
              >
                {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirm reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
