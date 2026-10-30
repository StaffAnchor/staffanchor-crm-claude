"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Phone, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type RecItem = {
  id: string;
  candidateId: string;
  mandateId: string;
  name: string;
  phone: string | null;
  headline: string;
  location: string | null;
  years: number | null;
  currentPay: number | null;
  expectedPay: number | null;
  notice: string | null;
  role: string;
  client: string | null;
  note: string | null;
  status: "new" | "in_pipeline" | "not_a_fit";
  declineReason: string | null;
  createdAt: string;
  seen: boolean;
  fromName: string;
  toName: string;
};

const DECLINE = ["Not the right profile", "Already in another process", "Wrong location", "Pay does not fit", "Not interested", "Other"];
const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};
const STATUS: Record<RecItem["status"], { label: string; cls: string }> = {
  new: { label: "Waiting", cls: "bg-amber-50 text-amber-800" },
  in_pipeline: { label: "Added to pipeline", cls: "bg-emerald-50 text-emerald-800" },
  not_a_fit: { label: "Not a fit", cls: "bg-slate-100 text-slate-600" },
};

function Facts({ r }: { r: RecItem }) {
  const bits = [r.location && `📍 ${r.location}`, r.years != null && `${r.years} yrs`, r.currentPay ? `₹${r.currentPay}L now` : null, r.expectedPay ? `₹${r.expectedPay}L expected` : null, r.notice && `notice ${r.notice}`].filter(Boolean);
  return bits.length ? <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{bits.join(" · ")}</p> : null;
}

export default function RecommendedList({ mine, sent }: { mine: RecItem[]; sent: RecItem[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opening the page counts as seeing them: the "new" dot clears for next time.
  useEffect(() => {
    const unseen = mine.filter((r) => !r.seen).map((r) => r.id);
    if (unseen.length) void supabase.from("candidate_recommendations").update({ seen_at: new Date().toISOString() }).in("id", unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addToPipeline(r: RecItem) {
    setBusy(r.id);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: e1 } = await supabase.from("candidate_mandate_links").insert({ candidate_id: r.candidateId, mandate_id: r.mandateId, added_by: user?.id ?? null, match_source: "recommended" });
    // Already on that role's pipeline counts as done.
    if (e1 && e1.code !== "23505") {
      setBusy(null);
      setError(e1.message);
      return;
    }
    await supabase.from("candidate_recommendations").update({ status: "in_pipeline", acted_at: new Date().toISOString() }).eq("id", r.id);
    setBusy(null);
    router.refresh();
  }

  async function decline(r: RecItem, reason: string) {
    setBusy(r.id);
    await supabase.from("candidate_recommendations").update({ status: "not_a_fit", decline_reason: reason, acted_at: new Date().toISOString() }).eq("id", r.id);
    setBusy(null);
    setDeclining(null);
    router.refresh();
  }

  const open = mine.filter((r) => r.status === "new");
  const handled = mine.filter((r) => r.status !== "new");

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="text-[24px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Recommended for you</h1>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Candidates a colleague picked out for a role they think you should work. Add them to the role&apos;s pipeline, or tell the sender why not.</p>
      {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>}

      <h2 className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Waiting for you ({open.length})</h2>
      {open.length === 0 ? (
        <p className={`${card} mt-2 p-5 text-[14px] text-slate-600 dark:text-slate-300`}>Nothing recommended to you right now.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {open.map((r) => (
            <li key={r.id} className={`${card} p-4 ${r.seen ? "" : "border-teal-300 dark:border-teal-800"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                    <Link href={`/candidates/${r.candidateId}`} className="hover:underline">{r.name}</Link>
                    {!r.seen && <span className="ml-2 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-semibold text-white">New</span>}
                  </p>
                  {r.headline && <p className="text-[13px] text-slate-600 dark:text-slate-300">{r.headline}</p>}
                  <Facts r={r} />
                </div>
                <span className="text-[12px] text-slate-400">{ago(r.createdAt)}</span>
              </div>
              <p className="mt-2 text-[13px] text-slate-700 dark:text-slate-200">
                For <Link href={`/mandates/${r.mandateId}`} className="font-medium text-teal-700 hover:underline dark:text-teal-300">{r.role}{r.client ? ` · ${r.client}` : ""}</Link>, recommended by <span className="font-medium">{r.fromName}</span>
              </p>
              {r.note && <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{r.note}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => addToPipeline(r)} disabled={busy === r.id} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-teal-500 disabled:opacity-60">
                  {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add to pipeline
                </button>
                {r.phone && (
                  <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                )}
                <button type="button" onClick={() => setDeclining(declining === r.id ? null : r.id)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-3.5 w-3.5" /> Not a fit
                </button>
              </div>
              {declining === r.id && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DECLINE.map((d) => (
                    <button key={d} type="button" onClick={() => decline(r, d)} className="rounded-full border border-slate-200 px-3 py-1 text-[12.5px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {handled.length > 0 && (
        <>
          <h2 className="mt-8 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Already handled</h2>
          <ul className={`${card} mt-2 divide-y divide-slate-100 dark:divide-slate-800`}>
            {handled.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                <Check className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                  <Link href={`/candidates/${r.candidateId}`} className="font-medium hover:underline">{r.name}</Link> for {r.role} · from {r.fromName}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}{r.declineReason ? `: ${r.declineReason}` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {sent.length > 0 && (
        <>
          <h2 className="mt-8 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Recommended by you</h2>
          <ul className={`${card} mt-2 divide-y divide-slate-100 dark:divide-slate-800`}>
            {sent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                  <Link href={`/candidates/${r.candidateId}`} className="font-medium hover:underline">{r.name}</Link> for {r.role} → {r.toName} · {ago(r.createdAt)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}{r.declineReason ? `: ${r.declineReason}` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
