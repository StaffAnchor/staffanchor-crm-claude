"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import ResultCard, { type Match } from "../../candidates/search/result-card";
import { chipsOf, CHIP_CLS } from "@/lib/search-chips";
import { emptySpec, type SearchSpec } from "@/lib/search-spec";

// Smart search inside a role. The prompt bar sits above the tabs; each search is kept, and its people wait under the
// Smart tab, grouped as right match, close match or worth a look, each with the reason in plain words.

type Run = { id: string; prompt: string; spec: SearchSpec; matches: Match[]; scanned: number; hidden: Record<string, number>; inPipelineSkipped: number; partial: boolean; understood: boolean; at: string };

type Ctx = {
  runs: Run[];
  current: Run | null;
  pick: (id: string) => void;
  running: boolean;
  error: string | null;
  search: (opts: { prompt: string; spec?: SearchSpec; ignoreRole?: boolean }) => Promise<void>;
  role: { id: string; title: string; city: string | null };
};

const SmartCtx = createContext<Ctx | null>(null);
const useSmart = () => useContext(SmartCtx)!;

const HIDDEN_LABEL: Record<string, string> = { city: "city", experience: "experience", expected_ctc: "expected CTC", current_ctc: "current CTC", notice: "notice period" };

type Row = {
  id: string;
  prompt: string;
  spec: SearchSpec;
  matches: Match[];
  scanned: number;
  hidden: Record<string, number>;
  in_pipeline_skipped: number;
  partial: boolean;
  understood: boolean;
  created_at: string;
};
const fromRow = (r: Row): Run => ({ id: r.id, prompt: r.prompt, spec: r.spec, matches: r.matches ?? [], scanned: r.scanned, hidden: r.hidden ?? {}, inPipelineSkipped: r.in_pipeline_skipped, partial: r.partial, understood: r.understood, at: r.created_at });

export function SmartSearchProvider({ mandateId, roleTitle, city, children }: { mandateId: string; roleTitle: string; city: string | null; children: ReactNode }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("mandate_smart_searches")
      .select("id, prompt, spec, matches, scanned, hidden, in_pipeline_skipped, partial, understood, created_at")
      .eq("mandate_id", mandateId)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as Row[]).map(fromRow);
        setRuns(list);
        setCurrentId(list[0]?.id ?? null);
      });
  }, [mandateId]);

  const search = useCallback(
    async ({ prompt, spec, ignoreRole }: { prompt: string; spec?: SearchSpec; ignoreRole?: boolean }) => {
      setRunning(true);
      setError(null);
      try {
        const r = await fetch("/api/candidate-prompt-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, mandateId, spec, ignoreRole }),
        });
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "Search failed");
          return;
        }
        const run: Run = { id: d.id ?? `local-${Date.now()}`, prompt: d.prompt ?? prompt, spec: d.spec, matches: d.matches, scanned: d.scanned, hidden: d.hidden ?? {}, inPipelineSkipped: d.inPipelineSkipped ?? 0, partial: !!d.partial, understood: !!d.understood, at: new Date().toISOString() };
        setRuns((prev) => [run, ...prev].slice(0, 8));
        setCurrentId(run.id);
      } catch {
        setError("Request failed. Try again.");
      } finally {
        setRunning(false);
      }
    },
    [mandateId]
  );

  const value = useMemo<Ctx>(
    () => ({ runs, current: runs.find((r) => r.id === currentId) ?? null, pick: setCurrentId, running, error, search, role: { id: mandateId, title: roleTitle, city } }),
    [runs, currentId, running, error, search, mandateId, roleTitle, city]
  );
  return <SmartCtx.Provider value={value}>{children}</SmartCtx.Provider>;
}

/** The small count shown on the Smart tab. */
export function SmartBadge() {
  const { current, running } = useSmart();
  if (running) return <Loader2 className="ml-1 h-3 w-3 animate-spin text-teal-600" />;
  if (!current) return null;
  return <span className="ml-1 rounded-full bg-teal-600 px-1.5 text-[11px] tabular-nums text-white">{current.matches.length}</span>;
}

export function SmartSearchBar() {
  const { search, running, error, current, role } = useSmart();
  const [prompt, setPrompt] = useState("");
  const [ignoreRole, setIgnoreRole] = useState(false);
  const [justRan, setJustRan] = useState(false);
  // One quiet line until you click in; the examples and options appear while you are writing.
  const [focused, setFocused] = useState(false);
  const expanded = focused || prompt.trim().length > 0;

  const go = async () => {
    if (!prompt.trim() || running) return;
    setJustRan(false);
    await search({ prompt: prompt.trim(), ignoreRole });
    setJustRan(true);
  };
  const examples = [`Only people who sell to enterprise, ${role.city ? `${role.city} or nearby` : "any city"}`, "Hunters with a team handling background", "Open to relocate, notice under 30 days"];

  return (
    <Card
      className="mt-3 p-2.5"
      onFocus={() => setFocused(true)}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {expanded && (
        <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-teal-600" />
          <span><span className="font-semibold text-slate-700 dark:text-slate-200">Smart search</span> · tell it who you want in plain words. The best people in the whole database are kept under the Smart tab, with why each one fits.</span>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {!expanded && <Sparkles className="hidden h-4 w-4 shrink-0 text-teal-600 sm:block" aria-hidden />}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          rows={expanded ? 2 : 1}
          placeholder="Smart search: who do you want? e.g. Hunters from B2B SaaS, 5-8 years, comfortable with Pune or Mumbai"
          className="min-h-[40px] flex-1 resize-none rounded-ros-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200 dark:focus:ring-teal-800"
        />
        <button onClick={go} disabled={running || !prompt.trim()} className="flex shrink-0 items-center justify-center gap-1.5 rounded-ros-md bg-teal-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-teal-500 disabled:opacity-50">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {running ? "Searching…" : "Find people"}
        </button>
      </div>
      {expanded && (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {examples.map((ex) => (
            <button key={ex} onClick={() => setPrompt(ex)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
              {ex}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <input type="checkbox" checked={!ignoreRole} onChange={(e) => setIgnoreRole(!e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-600" />
          Also keep this role&apos;s city, experience, budget and must-haves
        </label>
      </div>
      )}
      {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}
      {justRan && !running && !error && current && (
        <p className="mt-2 text-[12.5px] text-slate-600 dark:text-slate-300">
          {current.matches.length === 0 ? "Nobody fit this ask. Open the Smart tab to widen it." : `${current.matches.length} ${current.matches.length === 1 ? "person" : "people"} found.`}{" "}
          <a href="#smart" className="font-semibold text-teal-700 hover:underline dark:text-teal-300">
            Open the Smart tab →
          </a>
        </p>
      )}
    </Card>
  );
}

type Tier = "right" | "close" | "look";
const TIERS: { key: Tier; title: string; blurb: string }[] = [
  { key: "right", title: "Right match", blurb: "Fits what you asked on the facts we have, nothing important missing." },
  { key: "close", title: "Close match", blurb: "Mostly fits. Something is off by a little, or still to confirm on a call." },
  { key: "look", title: "Worth a look", blurb: "Fits in part. Look at the reason before you spend time." },
];

function tierOf(m: Match): Tier {
  const bad = m.checks.some((c) => c.status === "not_met");
  if (m.score >= 75 && !bad) return "right";
  if (m.score >= 50) return "close";
  return "look";
}

export function SmartSearchTab() {
  const { current, runs, pick, search, running, role } = useSmart();
  const [newMust, setNewMust] = useState("");

  if (!current) {
    return (
      <Card className="p-6 text-center">
        <p className="text-[13px] text-slate-500 dark:text-slate-400">No smart search yet. Type who you want in the box above and press Find people.</p>
      </Card>
    );
  }
  const chips = chipsOf(current.spec);
  const total = Object.values(current.hidden).reduce((a, b) => a + b, 0);
  const rerun = (spec: SearchSpec) => search({ prompt: current.prompt, spec });
  const groups = TIERS.map((t) => ({ ...t, items: current.matches.filter((m) => tierOf(m) === t.key) })).filter((g) => g.items.length > 0);

  return (
    <div id="smart" className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] uppercase tracking-wide text-slate-400">You asked</p>
            <p className="text-[13.5px] font-medium text-slate-800 dark:text-slate-100">{current.prompt}</p>
          </div>
          {runs.length > 1 && (
            <select value={current.id} onChange={(e) => pick(e.target.value)} className="max-w-[260px] rounded-md border border-slate-300 bg-transparent px-2 py-1 text-[12px] dark:border-slate-700">
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {r.prompt.slice(0, 40)}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="mb-2 mt-3 text-[12px] font-medium text-slate-600 dark:text-slate-300">
          {current.understood ? "How I read it" : "I couldn't break this down automatically, so it ran on meaning alone"}
          <span className="ml-1 font-normal text-slate-400">· remove a filter to widen the search, or add a requirement</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.length === 0 && <span className="text-[12px] text-slate-400">No specific filters found.</span>}
          {chips.map((c) => (
            <span key={c.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ${CHIP_CLS[c.kind]}`}>
              {c.text}
              <button disabled={running} onClick={() => rerun(c.remove(current.spec))} aria-label={`Remove ${c.text}`} className="rounded-full hover:bg-black/10">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <form
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const t = newMust.trim();
              if (!t) return;
              setNewMust("");
              rerun({ ...(current.spec ?? emptySpec()), must: [...current.spec.must, t].slice(0, 8) });
            }}
          >
            <input value={newMust} onChange={(e) => setNewMust(e.target.value)} placeholder="Add a requirement" className="w-40 rounded-full border border-dashed border-slate-300 bg-transparent px-2.5 py-1 text-[12px] dark:border-slate-600" />
            <button type="submit" disabled={running} aria-label="Add requirement" className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
          {running && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
        </div>
        <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
          {current.matches.length} {current.matches.length === 1 ? "person" : "people"} · looked at {current.scanned} in the database
          {total > 0 && <> · {total} left out for not fitting ({Object.entries(current.hidden).map(([k, n]) => `${n} on ${HIDDEN_LABEL[k] ?? k}`).join(", ")})</>}
          {current.inPipelineSkipped > 0 && <> · {current.inPipelineSkipped} already in this pipeline</>}
        </p>
        {current.partial && <p className="mt-1 text-[12px] text-amber-700">Part of the AI review failed, so some people may be missing. Search again to retry.</p>}
      </Card>

      {current.matches.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Nobody fit this ask. Remove a filter above to widen it.</p>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
              {g.title} <span className="font-normal text-slate-400">· {g.items.length}</span>
            </h3>
            <p className="mb-2 text-[12px] text-slate-500 dark:text-slate-400">{g.blurb}</p>
            <div className="space-y-2">
              {g.items.map((m) => (
                <ResultCard key={m.candidate_id} m={m} mandates={[{ id: role.id, role_title: role.title, city: role.city }]} mandateId={role.id} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
