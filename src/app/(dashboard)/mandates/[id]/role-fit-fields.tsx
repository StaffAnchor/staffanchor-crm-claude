"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The recruiter's confirmed read of how a candidate meets one role: "interested in this role" plus a status for every
// must-have. It is saved on the link as share_review, which is exactly what the client sees and what the database checks
// before sharing. These used to be a separate panel with its own Save; they are now part of the one call form.

type Status = "met" | "partial" | "not_met";
type Entry = { status: Status | ""; note: string };
type AiCheck = { requirement: string; status: "met" | "doubt" | "missing"; evidence: string | null; question: string | null };

const OPTIONS: { value: Status; label: string; on: string }[] = [
  { value: "met", label: "Met", on: "bg-emerald-600 text-white border-emerald-600" },
  { value: "partial", label: "Partly", on: "bg-amber-500 text-white border-amber-500" },
  { value: "not_met", label: "Not met", on: "bg-rose-600 text-white border-rose-600" },
];

export type RoleFit = {
  enabled: boolean;
  loaded: boolean;
  must: string[];
  good: string[];
  entries: Record<string, Entry>;
  ai: Record<string, AiCheck>;
  interested: "yes" | "no" | "";
  setInterested: (v: "yes" | "no" | "") => void;
  set: (req: string, patch: Partial<Entry>) => void;
  /** Null when the review is complete, else what to fix. */
  validate: () => string | null;
  /** Writes the review on the link. Throws with a readable message. */
  save: () => Promise<void>;
};

export function useRoleFit(role: { linkId: string; mandateId: string; candidateId: string } | null): RoleFit {
  const enabled = !!role;
  const linkId = role?.linkId ?? "";
  const mandateId = role?.mandateId ?? "";
  const candidateId = role?.candidateId ?? "";
  const [must, setMust] = useState<string[]>([]);
  const [good, setGood] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [ai, setAi] = useState<Record<string, AiCheck>>({});
  const [interested, setInterested] = useState<"yes" | "no" | "">("");
  const [loaded, setLoaded] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data: m }, { data: l }, { data: a }] = await Promise.all([
        supabase.from("mandates").select("must_haves, good_to_haves").eq("id", mandateId).single(),
        supabase.from("candidate_mandate_links").select("share_review").eq("id", linkId).single(),
        supabase.from("mandate_ai_matches").select("checks").eq("mandate_id", mandateId).eq("candidate_id", candidateId).maybeSingle(),
      ]);
      if (cancelled) return;
      setMust((m?.must_haves as string[] | null) ?? []);
      setGood((m?.good_to_haves as string[] | null) ?? []);
      const saved = (l?.share_review as { interested?: boolean; requirements?: { requirement: string; status: Status; note?: string }[] } | null) ?? null;
      const e: Record<string, Entry> = {};
      for (const r of saved?.requirements ?? []) e[r.requirement] = { status: r.status, note: r.note ?? "" };
      // Pre-fill from the AI read only where it was confident; "unsure" is left for the recruiter.
      const checks = (a?.checks as { must?: AiCheck[]; good?: AiCheck[] } | null) ?? null;
      const aiMap: Record<string, AiCheck> = {};
      for (const c of [...(checks?.must ?? []), ...(checks?.good ?? [])]) aiMap[c.requirement] = c;
      for (const [req, c] of Object.entries(aiMap)) {
        if (!e[req]) e[req] = { status: c.status === "met" ? "met" : c.status === "missing" ? "not_met" : "", note: "" };
      }
      setAi(aiMap);
      setEntries(e);
      setInterested(saved?.interested === true ? "yes" : saved?.interested === false ? "no" : "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, linkId, mandateId, candidateId]);

  const set = (req: string, patch: Partial<Entry>) => setEntries((p) => ({ ...p, [req]: { status: p[req]?.status ?? "", note: p[req]?.note ?? "", ...patch } }));

  function validate(): string | null {
    if (!enabled) return null;
    if (!interested) return "Confirm whether they are interested in this role.";
    for (const r of must) {
      const x = entries[r];
      if (!x?.status) return `Pick Met, Partly or Not met for: ${r}`;
      if (x.status !== "met" && !x.note.trim()) return `Add a short note for: ${r}`;
    }
    for (const r of good) {
      const x = entries[r];
      if (x?.status && x.status !== "met" && !x.note.trim()) return `Add a short note for: ${r}`;
    }
    return null;
  }

  async function save() {
    if (!enabled) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: prof } = user ? await supabase.from("profiles").select("full_name, email").eq("id", user.id).single() : { data: null };
    const requirements = [
      ...must.map((r) => ({ requirement: r, kind: "must", status: entries[r].status, note: entries[r].note.trim() })),
      ...good.filter((r) => entries[r]?.status).map((r) => ({ requirement: r, kind: "good", status: entries[r].status, note: entries[r].note.trim() })),
    ];
    const { error } = await supabase
      .from("candidate_mandate_links")
      .update({ share_review: { interested: interested === "yes", requirements, reviewed_by: user?.id ?? null, reviewer_name: prof?.full_name ?? prof?.email ?? null, reviewed_at: new Date().toISOString() } })
      .eq("id", linkId);
    if (error) throw new Error(`Couldn't save the role review: ${error.message}`);
  }

  return { enabled, loaded, must, good, entries, ai, interested, setInterested, set, validate, save };
}

const chip = (on: boolean, tone: string) => `rounded-full border px-3 py-1 text-[13px] font-medium ${on ? tone : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`;

/** The role's questions as plain rows inside the call form: interested, then each requirement. No headings of its own. */
export function RoleFitFields({ rf }: { rf: RoleFit }) {
  if (!rf.enabled) return null;
  if (!rf.loaded) return <p className="text-[13px] text-slate-400">Loading the role&apos;s requirements…</p>;
  const row = (req: string, required: boolean) => {
    const x = rf.entries[req] ?? { status: "", note: "" };
    const hint = rf.ai[req];
    return (
      <div key={req}>
        <p className="mb-1 text-[13px] font-medium text-slate-700 dark:text-slate-200">
          {req} {!required && <span className="font-normal text-slate-400">(nice to have)</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {OPTIONS.map((o) => (
            <button key={o.value} type="button" onClick={() => rf.set(req, { status: x.status === o.value ? "" : o.value })} className={chip(x.status === o.value, o.on)}>
              {o.label}
            </button>
          ))}
          {hint && <span className="text-[12px] text-slate-400">AI read: {hint.status === "met" ? "looks met" : hint.status === "missing" ? "looks missing" : "not sure"}</span>}
        </div>
        {(x.status === "partial" || x.status === "not_met") && (
          <input value={x.note} onChange={(e) => rf.set(req, { note: e.target.value })} placeholder="Short note the client will see: what is the gap, and why share anyway?" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent px-2.5 py-1.5 text-[13px] dark:border-slate-700" />
        )}
      </div>
    );
  };
  return (
    <div className="space-y-3.5">
      <div>
        <p className="mb-1 text-[13px] font-medium text-slate-700 dark:text-slate-200">Interested in this role?</p>
        <div className="flex gap-1.5">
          {(["yes", "no"] as const).map((v) => (
            <button key={v} type="button" onClick={() => rf.setInterested(rf.interested === v ? "" : v)} className={chip(rf.interested === v, v === "yes" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-700 bg-slate-700 text-white")}>
              {v === "yes" ? "Yes, they confirmed" : "No or not sure"}
            </button>
          ))}
        </div>
      </div>
      {rf.must.length === 0 && rf.good.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">This role has no requirements listed yet. Add the must-haves on the mandate so the client can see how each person fits.</p>
      ) : (
        <>
          {rf.must.map((r) => row(r, true))}
          {rf.good.map((r) => row(r, false))}
        </>
      )}
    </div>
  );
}
