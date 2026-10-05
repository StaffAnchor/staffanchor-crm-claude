"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = "met" | "partial" | "not_met";
type Entry = { status: Status | ""; note: string };
type AiCheck = { requirement: string; status: "met" | "doubt" | "missing"; evidence: string | null; question: string | null };

const OPTIONS: { value: Status; label: string; on: string }[] = [
  { value: "met", label: "Met", on: "bg-emerald-600 text-white border-emerald-600" },
  { value: "partial", label: "Partly", on: "bg-amber-500 text-white border-amber-500" },
  { value: "not_met", label: "Not met", on: "bg-rose-600 text-white border-rose-600" },
];

// The recruiter's own, confirmed read of how this candidate meets this role, saved on the
// link. This is what the client sees (including anything not met), so it is required before
// sharing: "interested in this role" plus a status for every must-have.
export default function RoleFitReview({
  linkId,
  mandateId,
  candidateId,
  onSaved,
}: {
  linkId: string;
  mandateId: string;
  candidateId: string;
  onSaved: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const [must, setMust] = useState<string[]>([]);
  const [good, setGood] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [ai, setAi] = useState<Record<string, AiCheck>>({});
  const [interested, setInterested] = useState<"yes" | "no" | "">("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: m }, { data: l }, { data: a }] = await Promise.all([
        supabase.from("mandates").select("must_haves, good_to_haves").eq("id", mandateId).single(),
        supabase.from("candidate_mandate_links").select("share_review").eq("id", linkId).single(),
        supabase.from("mandate_ai_matches").select("checks").eq("mandate_id", mandateId).eq("candidate_id", candidateId).maybeSingle(),
      ]);
      if (cancelled) return;
      setMust((m?.must_haves as string[] | null) ?? []);
      setGood((m?.good_to_haves as string[] | null) ?? []);
      const saved = (l?.share_review as { interested?: boolean; requirements?: { requirement: string; status: Status; note?: string }[]; reviewed_at?: string } | null) ?? null;
      const e: Record<string, Entry> = {};
      for (const r of saved?.requirements ?? []) e[r.requirement] = { status: r.status, note: r.note ?? "" };
      // Pre-fill from the AI read only where it was confident; "unsure" is left for the recruiter.
      const checks = (a?.checks as { must?: AiCheck[]; good?: AiCheck[] } | null) ?? null;
      const aiMap: Record<string, AiCheck> = {};
      for (const c of [...(checks?.must ?? []), ...(checks?.good ?? [])]) aiMap[c.requirement] = c;
      for (const [req, c] of Object.entries(aiMap)) {
        if (!e[req]) e[req] = { status: c.status === "met" ? "met" : c.status === "missing" ? "not_met" : "", note: c.status === "missing" ? "" : "" };
      }
      setAi(aiMap);
      setEntries(e);
      setInterested(saved?.interested === true ? "yes" : saved?.interested === false ? "no" : "");
      setSavedAt(saved?.reviewed_at ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  function set(req: string, patch: Partial<Entry>) {
    setEntries((p) => ({ ...p, [req]: { status: p[req]?.status ?? "", note: p[req]?.note ?? "", ...patch } }));
  }

  async function save() {
    setError(null);
    for (const r of must) {
      const x = entries[r];
      if (!x?.status) return setError(`Pick a status for: ${r}`);
      if (x.status !== "met" && !x.note.trim()) return setError(`Add a short note for: ${r}`);
    }
    for (const r of good) {
      const x = entries[r];
      if (x?.status && x.status !== "met" && !x.note.trim()) return setError(`Add a short note for: ${r}`);
    }
    if (!interested) return setError("Confirm whether the candidate is interested in this role.");
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: prof } = user ? await supabase.from("profiles").select("full_name, email").eq("id", user.id).single() : { data: null };
    const now = new Date().toISOString();
    const requirements = [
      ...must.map((r) => ({ requirement: r, kind: "must", status: entries[r].status, note: entries[r].note.trim() })),
      ...good.filter((r) => entries[r]?.status).map((r) => ({ requirement: r, kind: "good", status: entries[r].status, note: entries[r].note.trim() })),
    ];
    const { error: upErr } = await supabase
      .from("candidate_mandate_links")
      .update({
        share_review: {
          interested: interested === "yes",
          requirements,
          reviewed_by: user?.id ?? null,
          reviewer_name: prof?.full_name ?? prof?.email ?? null,
          reviewed_at: now,
        },
      })
      .eq("id", linkId);
    setSaving(false);
    if (upErr) return setError(upErr.message);
    setSavedAt(now);
    await onSaved();
  }

  if (!loaded) return <p className="text-[12.5px] text-slate-400">Loading the role&apos;s requirements…</p>;

  // A plain function (not a component) so rows keep their identity while typing.
  const renderRow = (req: string, required: boolean) => {
    const x = entries[req] ?? { status: "", note: "" };
    const hint = ai[req];
    return (
      <div key={req} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
        <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
          {req} {!required && <span className="font-normal text-slate-400">(nice to have)</span>}
        </p>
        {hint && (
          <p className="mt-0.5 text-[11.5px] text-slate-500">
            AI read: {hint.status === "met" ? "looks met" : hint.status === "missing" ? "looks missing" : "not sure"}
            {hint.evidence ? `, ${hint.evidence}` : hint.question ? `, ${hint.question}` : ""}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set(req, { status: x.status === o.value ? "" : o.value })}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium ${x.status === o.value ? o.on : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {(x.status === "partial" || x.status === "not_met") && (
          <input
            value={x.note}
            onChange={(e) => set(req, { note: e.target.value })}
            placeholder="Short note the client will see (what is the gap, and why share anyway?)"
            className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[12.5px]"
          />
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Role fit</h3>
          <p className="text-[12px] text-slate-500">The client sees this review, including anything that is not met.</p>
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[11.5px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Is the candidate interested in this role?</p>
        <div className="flex gap-1.5">
          {(["yes", "no"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setInterested(interested === v ? "" : v)}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium ${interested === v ? (v === "yes" ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-700 text-white border-slate-700") : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
            >
              {v === "yes" ? "Yes, confirmed with them" : "No / not sure"}
            </button>
          ))}
        </div>
      </div>

      {must.length === 0 && good.length === 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">This role has no requirements listed yet. Add them on the mandate (Must-haves) so the client can see how each candidate fits.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {must.map((r) => renderRow(r, true))}
          {good.map((r) => renderRow(r, false))}
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] text-rose-600">{error}</p>}
      <button type="button" onClick={save} disabled={saving} className="mt-3 rounded-lg bg-teal-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-teal-500 disabled:opacity-60">
        {saving ? "Saving…" : "Save role fit"}
      </button>
    </div>
  );
}
