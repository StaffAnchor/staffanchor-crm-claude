"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  Search,
  Flame,
  Users,
  Briefcase,
  Building2,
  CalendarClock,
  BarChart3,
  UserPlus2,
  UserRoundPlus,
} from "lucide-react";

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

type Command = {
  id: string;
  label: string;
  hint: string;
  icon: typeof Flame;
  href: string;
};

// ROS Phase 1: quick-nav commands shown when the palette is opened with an
// empty query (Linear/Raycast pattern -- default view is actions, typing
// switches to search). Each also has a bare-key global shortcut (no
// modifier) so recruiters never need to open the palette at all for these.
const COMMANDS: Command[] = [
  { id: "inbox", label: "Priority Actions", hint: "G then I", icon: Flame, href: "/inbox" },
  { id: "candidates", label: "Candidates", hint: "G then C", icon: Users, href: "/candidates" },
  { id: "mandates", label: "Mandates", hint: "G then M", icon: Briefcase, href: "/mandates" },
  { id: "clients", label: "Clients", hint: "", icon: Building2, href: "/clients" },
  { id: "interviews", label: "Interviews", hint: "", icon: CalendarClock, href: "/interviews" },
  { id: "reports", label: "Reports", hint: "", icon: BarChart3, href: "/reports" },
  { id: "new-candidate", label: "New candidate", hint: "N then C", icon: UserRoundPlus, href: "/candidates/new" },
  { id: "new-mandate", label: "New mandate", hint: "N then M", icon: UserPlus2, href: "/mandates" },
];

// Cmd+K / Ctrl+K command palette. Started as the Semantic Search Copilot
// (Phase 2, Task 3) -- searches candidates by meaning ("senior SaaS sales
// rep in Bangalore open to relocation") via /api/copilot/query. ROS Phase 1
// extends it into a full command palette: empty query shows quick-nav
// commands, typing switches to candidate search, plus bare-key global
// shortcuts (G I / G C / G M / N C / N M) that work without opening the
// palette at all, mirrored from Linear's chorded-shortcut convention so a
// single stray keypress while reading a page never fires a navigation by
// accident.
export default function CopilotPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CopilotResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryIdRef = useRef(0);
  const chordRef = useRef<{ key: string; at: number } | null>(null);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError(null);
    setActiveIdx(0);
  }, []);

  const showingCommands = !query.trim();
  const activeList: Array<Command | CopilotResult> = showingCommands ? COMMANDS : results;

  function go(href: string) {
    router.push(href);
    closePalette();
  }

  // Global shortcuts, active app-wide (not just while the palette is open):
  //  - Cmd/Ctrl+K: toggle the palette
  //  - Esc: close the palette
  //  - Two-key chords (G then I/C/M, N then C/M) for direct navigation
  //    without opening anything, within a 600ms window. Chords (rather than
  //    bare "c"/"m") avoid hijacking a single keystroke while a recruiter is
  //    typing in a non-input element or just reading -- matches Linear.
  //  - Ignored entirely while focus is in a text input/textarea/select, or
  //    the palette itself is open (its own input keydown handler takes over).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        if (open) closePalette();
        return;
      }

      if (open) return; // palette's own input handles its keys
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const now = Date.now();
      const pending = chordRef.current;
      const isChordStart = e.key === "g" || e.key === "G" || e.key === "n" || e.key === "N";

      if (pending && now - pending.at < 600) {
        chordRef.current = null;
        const lead = pending.key.toLowerCase();
        const second = e.key.toLowerCase();
        if (lead === "g" && second === "i") return void go("/inbox");
        if (lead === "g" && second === "c") return void go("/candidates");
        if (lead === "g" && second === "m") return void go("/mandates");
        if (lead === "n" && second === "c") return void go("/candidates/new");
        if (lead === "n" && second === "m") return void go("/mandates");
      }

      if (isChordStart) {
        chordRef.current = { key: e.key, at: now };
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closePalette, router]);

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
      setActiveIdx((i) => Math.min(i + 1, activeList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = activeList[activeIdx];
      if (!item) return;
      if (showingCommands) go((item as Command).href);
      else openResult(item as CopilotResult);
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
            placeholder="Jump to a page, or search candidates by meaning -- e.g. 'senior SaaS sales rep in Bangalore'"
            className="flex-1 text-[14px] outline-none placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
          <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-slate-400 shrink-0">
            esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {error && <div className="px-4 py-3 text-[13px] text-red-600">{error}</div>}

          {!error && !loading && !showingCommands && results.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">
              No matching candidates yet.
            </div>
          )}

          {showingCommands &&
            COMMANDS.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isCurrent = pathname === cmd.href || (cmd.href !== "/mandates" && pathname?.startsWith(cmd.href));
              return (
                <button
                  key={cmd.id}
                  onClick={() => go(cmd.href)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-b-0 transition-colors ${
                    idx === activeIdx ? "bg-blue-50/70" : ""
                  }`}
                >
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="flex-1 text-[13px] font-medium text-slate-800">{cmd.label}</span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 ring-1 ring-blue-200 rounded-full px-1.5 py-0.5">
                      current
                    </span>
                  )}
                  {cmd.hint && (
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">{cmd.hint}</span>
                  )}
                </button>
              );
            })}

          {!showingCommands &&
            results.map((r, idx) => (
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
            <Search className="w-3 h-3" /> {showingCommands ? "Commands" : "Copilot search"}
          </span>
        </div>
      </div>
    </div>
  );
}
