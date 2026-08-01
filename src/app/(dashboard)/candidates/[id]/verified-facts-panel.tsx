"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck, X, Plus } from "lucide-react";

type VerifiedFact = {
  id: string;
  fact_type: string;
  note: string | null;
  created_at: string;
};

// Deliberately NOT a free-for-all tag list -- these three types are the
// durable, candidate-intrinsic signals worth remembering across every
// future mandate this candidate is considered for. A raw "rejected for
// mandate X because of Y" reason does NOT belong here (see candidate-match.ts
// prompt comment) -- only add a fact here once it's genuinely confirmed
// about the candidate as a person, not about one specific role.
const FACT_TYPES: { value: string; label: string }[] = [
  { value: "resume_claims_unverified", label: "Resume claims unverified" },
  { value: "job_hopping_flag", label: "Job-hopping flag" },
  { value: "location_inflexibility", label: "Location inflexibility" },
  { value: "other", label: "Other" },
];

function factLabel(factType: string): string {
  return FACT_TYPES.find((f) => f.value === factType)?.label ?? factType.replace(/_/g, " ");
}

export default function VerifiedFactsPanel({
  candidateId,
  initialFacts,
}: {
  candidateId: string;
  initialFacts: VerifiedFact[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [facts, setFacts] = useState<VerifiedFact[]>(initialFacts);
  const [adding, setAdding] = useState(false);
  const [factType, setFactType] = useState(FACT_TYPES[0].value);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAdd() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("candidate_verified_facts")
      .insert({
        candidate_id: candidateId,
        fact_type: factType,
        note: note.trim() || null,
        created_by: user?.id ?? null,
      })
      .select("id, fact_type, note, created_at")
      .single();
    setSaving(false);
    if (!error && data) {
      setFacts((prev) => [data as VerifiedFact, ...prev]);
      setNote("");
      setAdding(false);
      router.refresh();
    }
  }

  async function handleRemove(factId: string) {
    setRemovingId(factId);
    const { error } = await supabase.from("candidate_verified_facts").delete().eq("id", factId);
    setRemovingId(null);
    if (!error) {
      setFacts((prev) => prev.filter((f) => f.id !== factId));
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Verified facts
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] text-purple-600 hover:underline flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <p className="text-[12px] text-slate-400 mb-3">
        Durable, recruiter-confirmed signals about this candidate as a person — not tied to any one mandate. These
        feed future mandate matching directly. Don&apos;t add a mandate-specific rejection reason here (e.g. missing
        one language); only add something genuinely true about the candidate in general.
      </p>

      {adding && (
        <div className="mb-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
          <select
            value={factType}
            onChange={(e) => setFactType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]"
          >
            {FACT_TYPES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional note — what did you verify, and how?"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px] resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-[12px] text-slate-500 dark:text-slate-400 px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {facts.length === 0 ? (
        <p className="text-[12px] text-slate-400">No verified facts recorded yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <span
              key={f.id}
              title={f.note ?? undefined}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 px-2.5 py-1 text-[12px]"
            >
              {factLabel(f.fact_type)}
              <button
                onClick={() => handleRemove(f.id)}
                disabled={removingId === f.id}
                className="hover:text-amber-950 disabled:opacity-50"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
