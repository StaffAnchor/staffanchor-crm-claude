"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, Check, LogIn, ThumbsDown, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClientReply } from "@/lib/client-replies";

const card = "rounded-ros-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm";

const KIND: Record<ClientReply["kind"], { icon: typeof LogIn; tone: string; verb: string }> = {
  interested: { icon: ThumbsUp, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300", verb: "is interested in" },
  interview_requested: { icon: CalendarClock, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300", verb: "wants to interview" },
  not_interested: { icon: ThumbsDown, tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300", verb: "passed on" },
  login: { icon: LogIn, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", verb: "signed in" },
};

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// Employer actions in the client portal, newest first: interested, interview asked, passed (with the reason), and sign-ins.
// Anything new since the last tick is highlighted; "Mark all seen" clears the highlight.
export default function ClientReplies({ items, unseen }: { items: ClientReply[]; unseen: number }) {
  const router = useRouter();
  const [showLogins, setShowLogins] = useState(false);
  const [busy, setBusy] = useState(false);
  const actions = items.filter((i) => i.kind !== "login");
  const logins = items.filter((i) => i.kind === "login");
  const shown = (showLogins ? items : actions).slice(0, 12);

  async function markSeen() {
    setBusy(true);
    await createClient().from("client_portal_events").update({ seen_at: new Date().toISOString() }).is("seen_at", null);
    setBusy(false);
    router.refresh();
  }

  return (
    <section className={`${card} mb-6`}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Client replies{unseen ? ` (${unseen} new)` : ""}</h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">What employers did in the client portal in the last 14 days.</p>
        </div>
        <div className="flex items-center gap-3 text-[13px]">
          {logins.length > 0 && (
            <button type="button" onClick={() => setShowLogins((v) => !v)} className="text-slate-500 hover:underline">
              {showLogins ? "Hide sign-ins" : `Show sign-ins (${logins.length})`}
            </button>
          )}
          <Link href="/clients/activity" className="font-medium text-teal-700 hover:underline dark:text-teal-300">See all</Link>
          {unseen > 0 && (
            <button type="button" onClick={markSeen} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              <Check className="h-4 w-4" /> Mark all seen
            </button>
          )}
        </div>
      </header>
      {shown.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-5 text-[14px] text-slate-600 dark:border-slate-800 dark:text-slate-300">No employer activity yet.</p>
      ) : (
        <ul>
          {shown.map((r) => {
            const k = KIND[r.kind];
            const Icon = k.icon;
            const subject = r.kind === "login" ? r.who : r.candidate ?? "a candidate";
            return (
              <li key={r.id} className={`border-t border-slate-100 first:border-t-0 dark:border-slate-800 ${r.unseen ? "bg-teal-50/40 dark:bg-teal-950/10" : ""}`}>
                <Link href={r.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ros-focusable">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${k.tone}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">
                      {r.kind === "login" ? (
                        <>
                          {subject} <span className="font-normal text-slate-500 dark:text-slate-400">{k.verb}{r.client ? ` · ${r.client}` : ""}</span>
                        </>
                      ) : (
                        <>
                          {r.client ?? "A client"} <span className="font-normal text-slate-500 dark:text-slate-400">{k.verb}</span> {subject}
                        </>
                      )}
                    </p>
                    <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                      {[r.kind === "login" ? null : r.role, r.kind === "login" ? null : r.who, r.extra].filter(Boolean).join(" · ") || (r.kind === "login" ? "Client portal" : "")}
                    </p>
                  </div>
                  {r.unseen && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" aria-label="New" />}
                  <span className="shrink-0 text-[12px] text-slate-400">{ago(r.at)}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
