"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Flame,
  CalendarClock,
  CheckCircle2,
  X,
  ArrowRight,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type InboxItem = {
  id: string;
  created_at: string;
  candidate_id: string | null;
  candidate_name: string | null;
  mandate_id: string | null;
  mandate_role_title: string | null;
  mandate_client_name: string | null;
  client_id: string | null;
  task_type: string;
  title: string;
  detail: string | null;
  priority: "low" | "normal" | "high";
  status: "open" | "done" | "dismissed";
};

const TASK_META: Record<string, { icon: typeof Flame; label: string; tint: string }> = {
  TRIGGER_INTERVIEW_COORDINATION: {
    icon: CalendarClock,
    label: "Interview coordination",
    tint: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  FOLLOW_UP_ON_OFFER: {
    icon: ArrowRight,
    label: "Offer follow-up",
    tint: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
};

function metaFor(taskType: string) {
  return (
    TASK_META[taskType] ?? {
      icon: Flame,
      label: "Action needed",
      tint: "bg-slate-50 text-slate-700 ring-slate-200",
    }
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function InboxView({
  initialItems,
  fetchError,
}: {
  initialItems: InboxItem[];
  fetchError: string | null;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<InboxItem[]>(initialItems);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const focused = items[focusedIdx] ?? null;

  const resolve = useCallback(
    async (id: string, status: "done" | "dismissed") => {
      const prevItems = items;
      setResolvingId(id);
      // Optimistic update: remove immediately, restore on failure.
      setItems((cur) => cur.filter((i) => i.id !== id));
      const { error } = await supabase.rpc("resolve_inbox_item", { p_id: id, p_status: status });
      setResolvingId(null);
      if (error) {
        setItems(prevItems);
      }
    },
    [items, supabase]
  );

  // Keyboard-first navigation: J/K to move focus, Enter is a no-op beyond
  // focusing (the drawer already tracks focus live), D to mark done, X to
  // dismiss -- mirrors the brief's "never leave the list to act" goal.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
      } else if ((e.key === "d" || e.key === "D") && focused) {
        e.preventDefault();
        resolve(focused.id, "done");
      } else if (e.key === "x" || e.key === "X") {
        if (focused) {
          e.preventDefault();
          resolve(focused.id, "dismissed");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items.length, focused, resolve]);

  useEffect(() => {
    if (focusedIdx >= items.length) {
      setFocusedIdx(Math.max(items.length - 1, 0));
    }
  }, [items.length, focusedIdx]);

  const grouped = useMemo(() => {
    const high = items.filter((i) => i.priority === "high");
    const rest = items.filter((i) => i.priority !== "high");
    return { high, rest };
  }, [items]);

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Priority Actions
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {items.length === 0
              ? "You're all caught up."
              : `${items.length} open item${items.length === 1 ? "" : "s"} needing action`}
          </p>
        </div>
        <div className="text-[11px] text-slate-400 hidden md:flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">J</kbd>{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">K</kbd> navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">D</kbd> done
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">X</kbd> dismiss
          </span>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          Couldn&apos;t load your inbox: {fetchError}
        </div>
      )}

      {items.length === 0 && !fetchError ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-[14px] font-medium text-slate-700">Nothing needs your attention right now</p>
          <p className="text-[12px] text-slate-500 mt-1">
            New tasks appear here automatically as candidates move through your pipelines.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
          {/* Dense single-column action list */}
          <div ref={listRef} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {[...grouped.high, ...grouped.rest].map((item) => {
              const idx = items.findIndex((i) => i.id === item.id);
              const isFocused = idx === focusedIdx;
              const meta = metaFor(item.task_type);
              const Icon = meta.icon;
              const isResolving = resolvingId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setFocusedIdx(idx)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${
                    isFocused ? "bg-blue-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ring-1 ${meta.tint}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-900 truncate">{item.title}</span>
                      {item.priority === "high" && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 ring-1 ring-orange-200 rounded-full px-1.5 py-0.5">
                          High
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">{timeAgo(item.created_at)}</span>
                  </span>
                  {isResolving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Context drawer -- follows keyboard focus live */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-20">
            {focused ? (
              <ContextDrawer item={focused} onResolve={resolve} resolving={resolvingId === focused.id} />
            ) : (
              <p className="text-[13px] text-slate-400">Select an item to see details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextDrawer({
  item,
  onResolve,
  resolving,
}: {
  item: InboxItem;
  onResolve: (id: string, status: "done" | "dismissed") => void;
  resolving: boolean;
}) {
  const meta = metaFor(item.task_type);
  const Icon = meta.icon;
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Reset the WhatsApp send status whenever focus moves to a different item.
  useEffect(() => {
    setSending(false);
    setSendResult(null);
  }, [item.id]);

  async function handleSendUpdate() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxItemId: item.id }),
      });
      const body = await res.json();
      if (body.ok) {
        setSendResult({ ok: true, message: "WhatsApp update sent." });
      } else if (body.status === "not_configured") {
        setSendResult({ ok: false, message: "WhatsApp isn't connected yet -- this will send automatically once it's set up." });
      } else {
        setSendResult({ ok: false, message: body.error ?? "Couldn't send the update." });
      }
    } catch {
      setSendResult({ ok: false, message: "Couldn't send the update." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ring-1 ${meta.tint}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{meta.label}</p>
          <p className="text-[14px] font-semibold text-slate-900 leading-snug">{item.title}</p>
        </div>
      </div>

      {item.detail && <p className="text-[13px] text-slate-600 mb-4">{item.detail}</p>}

      <div className="space-y-2 mb-5">
        {item.candidate_id && (
          <Link
            href={`/candidates/${item.candidate_id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
          >
            <span>
              Candidate: <span className="font-medium">{item.candidate_name ?? "View profile"}</span>
            </span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </Link>
        )}
        {item.mandate_id && (
          <Link
            href={`/mandates/${item.mandate_id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
          >
            <span>
              Mandate:{" "}
              <span className="font-medium">
                {item.mandate_role_title ?? "View mandate"}
                {item.mandate_client_name ? ` · ${item.mandate_client_name}` : ""}
              </span>
            </span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </Link>
        )}
      </div>

      <button
        onClick={handleSendUpdate}
        disabled={sending}
        className="w-full mb-2 flex items-center justify-center gap-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 rounded-lg px-3 py-2 disabled:opacity-60"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
        Send Update via WhatsApp
      </button>
      {sendResult && (
        <p className={`text-[11px] mb-3 ${sendResult.ok ? "text-emerald-600" : "text-slate-500"}`}>
          {sendResult.message}
        </p>
      )}

      <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
        <button
          onClick={() => onResolve(item.id, "done")}
          disabled={resolving}
          className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Mark done
          <kbd className="ml-1 text-[10px] opacity-70 font-mono">D</kbd>
        </button>
        <button
          onClick={() => onResolve(item.id, "dismissed")}
          disabled={resolving}
          className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-60"
        >
          <X className="w-3.5 h-3.5" />
          Dismiss
          <kbd className="ml-1 text-[10px] opacity-70 font-mono">X</kbd>
        </button>
      </div>
    </div>
  );
}
