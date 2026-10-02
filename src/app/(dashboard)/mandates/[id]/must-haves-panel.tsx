"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ListChecks, Check, Pencil, X, Plus, ChevronDown, Sparkles, Loader2 } from "lucide-react";

function TagEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  }

  return (
    <div className="mb-3">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[12px] px-2.5 py-1"
          >
            {item}
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-[12px] text-slate-400">None added yet.</span>}
      </div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={`Add a ${label.toLowerCase()} item...`}
          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[12px]"
        />
        <button
          onClick={add}
          className="rounded-lg border border-slate-300 px-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function MustHavesPanel({
  mandateId,
  initialMustHaves,
  initialGoodToHaves,
}: {
  mandateId: string;
  initialMustHaves: string[];
  initialGoodToHaves: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(initialMustHaves.length === 0 && initialGoodToHaves.length === 0);
  const [mustHaves, setMustHaves] = useState<string[]>(initialMustHaves);
  const [goodToHaves, setGoodToHaves] = useState<string[]>(initialGoodToHaves);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<{ questions: string[]; sources: { text: string; source: string }[] } | null>(null);

  // Asks the server for a suggestion built from this role's JD. Nothing is
  // saved: suggestions land in the editor (added to whatever is already
  // there, skipping duplicates) and the recruiter reviews them and presses Save.
  async function handleDraft() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/draft-spec`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraftError(body.error ?? "Couldn't draft this just now. Try again.");
        return;
      }
      const merge = (current: string[], incoming: { text: string }[]) => {
        const have = new Set(current.map((c) => c.toLowerCase()));
        return [...current, ...incoming.map((i) => i.text).filter((t) => !have.has(t.toLowerCase()))];
      };
      setMustHaves((cur) => merge(cur, body.mustHaves ?? []));
      setGoodToHaves((cur) => merge(cur, body.goodToHaves ?? []));
      setDraftInfo({
        questions: body.questionsForClient ?? [],
        sources: [...(body.mustHaves ?? []), ...(body.goodToHaves ?? [])].filter((i: { source: string }) => i.source),
      });
      setEditing(true);
    } catch {
      setDraftError("Couldn't reach the server. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("mandates")
      .update({ must_haves: mustHaves, good_to_haves: goodToHaves })
      .eq("id", mandateId);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setDraftInfo(null);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ease-ros ${collapsed ? "-rotate-90" : ""}`} />
          <ListChecks className="w-3.5 h-3.5 text-slate-400" /> Must haves / Good to haves
        </button>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {!collapsed && (
      <>
      <p className="text-[12px] text-slate-400 mb-3">
        Used by AI candidate matching below to score and explain fit against this mandate. Both fields are
        required before this mandate can be published -- a candidate missing a must-have is excluded from
        matches; a candidate missing a good-to-have is never penalized for it, only scored higher if they have it.
      </p>

      <div className="mb-3">
        <button
          onClick={handleDraft}
          disabled={drafting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 text-[12px] font-medium px-3 py-1.5 hover:bg-teal-100 dark:hover:bg-teal-950/50 disabled:opacity-60"
        >
          {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {drafting ? "Reading the JD..." : "Draft from the JD"}
        </button>
        {draftError && <p className="text-[12px] text-red-600 mt-1.5">{draftError}</p>}
      </div>

      {draftInfo && (
        <div className="mb-3 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/20 p-3 text-[12px] text-slate-700 dark:text-slate-300">
          <p className="font-medium text-teal-900 dark:text-teal-200 mb-1">Suggested from the JD. Check each one, edit or remove what&apos;s wrong, then Save.</p>
          {draftInfo.questions.length > 0 && (
            <>
              <p className="mt-2 font-medium">Worth asking the client</p>
              <ul className="list-disc pl-4">
                {draftInfo.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
          {draftInfo.sources.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-slate-500 dark:text-slate-400">Where each came from</summary>
              <ul className="mt-1 space-y-0.5">
                {draftInfo.sources.map((it, i) => (
                  <li key={i}>
                    <span className="font-medium">{it.text}</span> <span className="text-slate-500 dark:text-slate-400">· {it.source}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {editing ? (
        <>
          <TagEditor label="Must haves *" items={mustHaves} onChange={setMustHaves} />
          <TagEditor label="Good to haves *" items={goodToHaves} onChange={setGoodToHaves} />
          {(mustHaves.length === 0 || goodToHaves.length === 0) && (
            <p className="text-[11px] text-amber-700 mb-2">
              At least one entry in each list is required before this mandate can be published.
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-60 mt-1"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Must haves</p>
            <div className="flex flex-wrap gap-1.5">
              {mustHaves.map((item, i) => (
                <span key={i} className="rounded-full bg-red-50 text-red-700 text-[12px] px-2.5 py-1">
                  {item}
                </span>
              ))}
              {mustHaves.length === 0 && <span className="text-[12px] text-slate-400">None added.</span>}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Good to haves</p>
            <div className="flex flex-wrap gap-1.5">
              {goodToHaves.map((item, i) => (
                <span key={i} className="rounded-full bg-blue-50 text-blue-700 text-[12px] px-2.5 py-1">
                  {item}
                </span>
              ))}
              {goodToHaves.length === 0 && <span className="text-[12px] text-slate-400">None added.</span>}
            </div>
          </div>
        </div>
      )}

      {saved && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600 mt-2">
          <Check className="w-3 h-3" /> Saved
        </p>
      )}
      </>
      )}
    </div>
  );
}
