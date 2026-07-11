"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ArrowRight, Search } from "lucide-react";

type CopilotResult = {
  id: string;
  full_name: string;
  category: string | null;
  sub_domain: string | null;
  current_job_title: string | null;
  current_employer: string | null;
  total_experience_years: number | null;
  current_location: string | null;
  status: string;
  ai_summary: string | null;
  similarity: number;
};

// Cmd+K / Ctrl+K command palette for the Semantic Search Copilot (Phase 2,
// Task 3). Global, dropped once into the dashboard layout -- searches
// candidates by meaning ("senior SaaS sales rep in Bangalore open to
// relocation") rather than exact keyword match, via /api/copilot/query.
// Debounced, keyboard-first (Up/Down/Enter to navigate + open), optimistic
// loading state, no page reload.
export default function CopilotPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CopilotResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryIdRef = useRef(0);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError(null);
    setActiveIdx(0);
  }, []);

  // Global Cmd+K / Ctrl+K toggle, and Escape to close.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        closePalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette]);

  useEffect(() => {
    if (open) {
      // Let the modal mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search-as-you-type; ignores stale responses that resolve
  // out of order.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const queryId = ++lastQueryIdRef.current;
      try {
        const res = await fetch("/api/copilot/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const body = await res.json();
        if (queryId !== lastQueryIdRef.current) return; // stale
        if (!res.ok) {
          setError(body.error ?? "Search failed");
          setResults([]);
        } else {
          setError(null);
          setResults(body.results ?? []);
          setActiveIdx(0);
        }
      } catch {
        if (queryId === lastQueryIdRef.current) setError("Search failed");
      } finally {
        if (queryId === lastQueryIdRef.current) setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function openResult(r: CopilotResult) {
    router.push(`/candidates/${r.id}`);
    closePalette();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      e.preventDefault();
      openResult(results[activeIdx]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[1px] flex items-start justify-center pt-[12vh] px-4"
      onClick={closePalette}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search candidates by meaning -- e.g. 'senior SaaS sales rep in Bangalore, open to relocation'"
            className="flex-1 text-[14px] outline-none placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
          <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-slate-400 shrink-0">
            esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {error && <div className="px-4 py-3 text-[13px] text-red-600">{error}</div>}

          {!error && !loading && query.trim() && results.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">
              No matching candidates yet.
            </div>
          )}

          {!error && !query.trim() && (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">
              Try describing who you&apos;re looking for in plain language.
            </div>
          )}

          {results.map((r, idx) => (
            <button
              key={r.id}
              onClick={() => openResult(r)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-b-0 transition-colors ${
                idx === activeIdx ? "bg-blue-50/70" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-slate-900 truncate">{r.full_name}</span>
                  <span className="text-[10px] shrink-0 font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-1.5 py-0.5">
                    {Math.round(r.similarity * 100)}% match
                  </span>
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5 truncate">
                  {[r.current_job_title, r.current_employer].filter(Boolean).join(" @ ") || "—"}
                  {r.category ? ` · ${[r.category, r.sub_domain].filter(Boolean).join(" - ")}` : ""}
                </span>
                {r.ai_summary && (
                  <span className="block text-[11px] text-slate-400 mt-0.5 truncate">{r.ai_summary}</span>
                )}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">↑</kbd>
            <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">↓</kbd> navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">Enter</kbd> open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Search className="w-3 h-3" /> Copilot search
          </span>
        </div>
      </div>
    </div>
  );
}
