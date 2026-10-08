"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import ResultCard, { type Match, type MandateOption } from "./result-card";
import { emptySpec, type SearchSpec } from "@/lib/search-spec";

// Global free-text candidate search. Describe who you need in plain words, or pick a mandate and
// start from its place, experience, budget and must-haves. The search shows how it understood the
// ask as chips you can remove or add to, checks the hard constraints with plain code, and shows
// each candidate with their key facts and a tick per requirement.

const EXAMPLES = [
  "B2B SaaS Account Executives in Bangalore or Mumbai, 4-7 years experience, currently hunting not farming",
  "B2C sales candidates open to relocation, strong in EdTech or FinTech, notice period under 30 days",
  "Sales leaders with team management experience, 8+ years, expected CTC under 30 LPA",
];

const HIDDEN_LABEL: Record<string, string> = { city: "city", experience: "experience", expected_ctc: "expected CTC", current_ctc: "current CTC", notice: "notice period" };

type Response = {
  matches: Match[];
  scanned: number;
  spec: SearchSpec;
  understood: boolean;
  hidden: Record<string, number>;
  inPipelineSkipped: number;
  partial: boolean;
  prompt: string;
};

type Chip = { id: string; text: string; kind: "hard" | "must" | "nice"; remove: (s: SearchSpec) => SearchSpec };

function chipsOf(spec: SearchSpec): Chip[] {
  const out: Chip[] = [];
  spec.cities.forEach((c) => out.push({ id: `city:${c}`, text: c, kind: "hard", remove: (s) => ({ ...s, cities: s.cities.filter((x) => x !== c) }) }));
  if (spec.min_exp !== null || spec.max_exp !== null) {
    const t = spec.min_exp !== null && spec.max_exp !== null ? `${spec.min_exp}–${spec.max_exp} yrs` : spec.min_exp !== null ? `${spec.min_exp}+ yrs` : `up to ${spec.max_exp} yrs`;
    out.push({ id: "exp", text: t, kind: "hard", remove: (s) => ({ ...s, min_exp: null, max_exp: null }) });
  }
  if (spec.max_expected_ctc !== null) out.push({ id: "ectc", text: `Expected ≤ ${spec.max_expected_ctc} LPA`, kind: "hard", remove: (s) => ({ ...s, max_expected_ctc: null }) });
  if (spec.max_current_ctc !== null) out.push({ id: "cctc", text: `Current ≤ ${spec.max_current_ctc} LPA`, kind: "hard", remove: (s) => ({ ...s, max_current_ctc: null }) });
  if (spec.max_notice_days !== null) out.push({ id: "notice", text: spec.max_notice_days === 0 ? "Immediate joiner" : `Notice ≤ ${spec.max_notice_days} days`, kind: "hard", remove: (s) => ({ ...s, max_notice_days: null }) });
  spec.must.forEach((m) => out.push({ id: `must:${m}`, text: m, kind: "must", remove: (s) => ({ ...s, must: s.must.filter((x) => x !== m) }) }));
  spec.nice.forEach((m) => out.push({ id: `nice:${m}`, text: `${m} (nice to have)`, kind: "nice", remove: (s) => ({ ...s, nice: s.nice.filter((x) => x !== m) }) }));
  return out;
}

const CHIP_CLS = {
  hard: "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-800",
  must: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-800",
  nice: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

function PromptSearch() {
  const params = useSearchParams();
  const startMandate = params.get("mandate");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Response | null>(null);
  const [practiceId, setPracticeId] = useState("");
  const [mandateId, setMandateId] = useState<string>(startMandate ?? "");
  const [spec, setSpec] = useState<SearchSpec | null>(null);
  const [newMust, setNewMust] = useState("");
  const [allPractices, setAllPractices] = useState<{ id: string; name: string }[]>([]);
  const [mandates, setMandates] = useState<MandateOption[]>([]);
  const started = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("practices").select("id, name").order("sort_order", { ascending: true }).then(({ data }) => data && setAllPractices(data));
    supabase.from("mandates").select("id, role_title, city").eq("status", "open").order("created_at", { ascending: false }).then(({ data }) => data && setMandates(data as MandateOption[]));
  }, []);

  const run = useCallback(
    async (opts: { text?: string; useSpec?: SearchSpec | null; mandate?: string }) => {
      const text = (opts.text ?? "").trim();
      const mid = opts.mandate ?? "";
      if (!text && !mid) return;
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/candidate-prompt-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, practiceId: practiceId || undefined, mandateId: mid || undefined, spec: opts.useSpec ?? undefined }),
        });
        const data = await r.json();
        if (!r.ok) {
          setError(data.error ?? "Search failed");
          return;
        }
        setRes(data as Response);
        setSpec((data as Response).spec);
        if (!text) setPrompt((data as Response).prompt);
      } catch {
        setError("Request failed");
      } finally {
        setLoading(false);
      }
    },
    [practiceId]
  );

  // Arriving from a mandate page: start the search from that mandate.
  useEffect(() => {
    if (startMandate && !started.current) {
      started.current = true;
      run({ mandate: startMandate });
    }
  }, [startMandate, run]);

  const chips = spec ? chipsOf(spec) : [];
  const total = Object.values(res?.hidden ?? {}).reduce((a, b) => a + b, 0);
  const groups: { title: string; hint: string; items: Match[] }[] = res
    ? [
        { title: "Strong matches", hint: "75 and above", items: res.matches.filter((m) => m.score >= 75) },
        { title: "Possible matches", hint: "50 to 74", items: res.matches.filter((m) => m.score >= 50 && m.score < 75) },
        { title: "Weaker matches", hint: "below 50", items: res.matches.filter((m) => m.score < 50) },
      ].filter((g) => g.items.length > 0)
    : [];

  return (
    <div>
      <Link href="/candidates" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Candidates
      </Link>

      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          <Sparkles className="h-5 w-5 text-indigo-600" /> Prompt search
        </h1>
        <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">Describe who you need in plain English, or start from one of your open mandates. Searches the whole candidate database.</p>
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <label className="shrink-0 text-[11.5px] text-slate-500 dark:text-slate-400">Search for a mandate:</label>
          <select
            value={mandateId}
            onChange={(e) => {
              setMandateId(e.target.value);
              setSpec(null);
              if (e.target.value) run({ mandate: e.target.value });
            }}
            className="max-w-[320px] rounded-md border border-slate-300 bg-transparent px-2 py-1 text-[12px] dark:border-slate-700"
          >
            <option value="">No mandate (free search)</option>
            {mandates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.role_title}
                {m.city ? ` · ${m.city}` : ""}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run({ text: prompt, mandate: mandateId });
          }}
          placeholder="e.g. B2B SaaS Account Executives in Bangalore, 4-7 years, currently hunting not farming"
          rows={3}
          className="w-full resize-none rounded-ros-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200 dark:focus:ring-indigo-800"
        />
        <div className="mb-2 mt-2.5 flex items-center gap-2">
          <label className="shrink-0 text-[11.5px] text-slate-500 dark:text-slate-400">Restrict to practice:</label>
          <select value={practiceId} onChange={(e) => setPracticeId(e.target.value)} className="rounded-md border border-slate-300 bg-transparent px-2 py-1 text-[12px] dark:border-slate-700">
            <option value="">All practices</option>
            {allPractices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setPrompt(ex)} className="rounded-ros-full bg-slate-100 px-2.5 py-1 text-[11.5px] text-slate-500 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">
                {ex.length > 46 ? `${ex.slice(0, 46)}…` : ex}
              </button>
            ))}
          </div>
          <button
            onClick={() => run({ text: prompt, mandate: mandateId })}
            disabled={loading || (!prompt.trim() && !mandateId)}
            className="flex shrink-0 items-center gap-1.5 rounded-ros-md bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </Card>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50/40 p-4 dark:border-red-900 dark:bg-red-950/20">
          <p className="text-[13px] text-red-700 dark:text-red-400">{error}</p>
        </Card>
      )}

      {res && (
        <>
          <Card className="mb-4 p-4">
            <p className="mb-2 text-[12px] font-medium text-slate-600 dark:text-slate-300">
              {res.understood ? "How I read your search" : "I couldn't break this search down automatically, so it runs on meaning alone"}
              <span className="ml-1 font-normal text-slate-400">· remove a filter to widen the search, or add a requirement</span>
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.length === 0 && <span className="text-[12px] text-slate-400">No specific filters found.</span>}
              {chips.map((c) => (
                <span key={c.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ${CHIP_CLS[c.kind]}`}>
                  {c.text}
                  <button onClick={() => spec && run({ text: prompt, useSpec: c.remove(spec), mandate: mandateId })} aria-label={`Remove ${c.text}`} className="rounded-full hover:bg-black/10">
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
                  const next = { ...(spec ?? emptySpec()) };
                  next.must = [...next.must, t].slice(0, 6);
                  setNewMust("");
                  run({ text: prompt, useSpec: next, mandate: mandateId });
                }}
              >
                <input value={newMust} onChange={(e) => setNewMust(e.target.value)} placeholder="Add a requirement" className="w-40 rounded-full border border-dashed border-slate-300 bg-transparent px-2.5 py-1 text-[12px] dark:border-slate-600" />
                <button type="submit" aria-label="Add requirement" className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
            <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
              {res.matches.length} match{res.matches.length === 1 ? "" : "es"} · looked at {res.scanned} candidates
              {total > 0 && (
                <>
                  {" "}
                  · {total} hidden for not fitting (
                  {Object.entries(res.hidden)
                    .map(([k, n]) => `${n} on ${HIDDEN_LABEL[k] ?? k}`)
                    .join(", ")}
                  )
                </>
              )}
              {res.inPipelineSkipped > 0 && <> · {res.inPipelineSkipped} already in this mandate&apos;s pipeline</>}
            </p>
            {res.partial && <p className="mt-1 text-[12px] text-amber-700">Part of the AI review failed, so some candidates may be missing. Search again to retry.</p>}
          </Card>

          {res.matches.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-slate-500 dark:text-slate-400">No strong matches for this request. Remove a filter above to widen it.</p>
            </Card>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <section key={g.title}>
                  <h2 className="mb-2 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                    {g.title} <span className="font-normal text-slate-400">· {g.hint} · {g.items.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {g.items.map((m) => (
                      <ResultCard key={m.candidate_id} m={m} mandates={mandates} mandateId={mandateId || null} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CandidatePromptSearchPage() {
  return (
    <Suspense fallback={null}>
      <PromptSearch />
    </Suspense>
  );
}
