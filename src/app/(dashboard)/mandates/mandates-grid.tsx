"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, MapPin, Users, Clock, X, ArrowUpRight, AlertTriangle, Sparkles } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "info",
  open: "success",
  on_hold: "warning",
  closed: "neutral",
  filled: "accent",
};

export type HealthSignal = { label: string; tone: "warning" | "danger" };

export type TopMatch = { candidateId: string; name: string; score: number; reason: string };

export type MandateSummary = {
  id: string;
  client_name: string;
  role_title: string;
  category: string | null;
  sub_domain: string | null;
  city: string | null;
  status: string;
  created_at: string;
  daysOpen: number;
  linked: number;
  submitted: number;
  signals: HealthSignal[];
  topMatch: TopMatch | null;
};

// Health-signal quick view: a slide-over drawer that surfaces the same
// "is this mandate healthy" read a recruiter would otherwise have to open
// the full detail page to piece together (sourcing progress, client
// feedback lag, staleness) -- without leaving the list. The full detail
// page (with all its edit panels) stays exactly as-is; this is a faster
// glance layer on top of it, not a replacement.
export default function MandatesGrid({ mandates }: { mandates: MandateSummary[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = mandates.find((m) => m.id === openId) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {mandates.map((m) => {
          const progressPct = m.linked ? Math.round((m.submitted / m.linked) * 100) : 0;
          return (
            <Card
              key={m.id}
              interactive
              className="cursor-pointer"
              onClick={() => setOpenId(m.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate">{m.role_title}</p>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                    <Building2 className="w-3 h-3 shrink-0" /> {m.client_name}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[m.status] ?? "neutral"} className="normal-case tracking-normal shrink-0">
                  {m.status.replace("_", " ")}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-[12px] text-slate-500 dark:text-slate-400 mb-3">
                {m.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {m.city}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {m.linked} linked
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {m.daysOpen}d open
                </span>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Pipeline progress</span>
                  <span>{m.submitted}/{m.linked || 0} submitted+</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-ros"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {m.signals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {m.signals.map((s) => (
                    <Badge key={s.label} tone={s.tone} size="sm" icon={<AlertTriangle className="w-2.5 h-2.5" />} className="normal-case tracking-normal">
                      {s.label}
                    </Badge>
                  ))}
                </div>
              )}

              {/* AI top match -- reads the cached auto_match_results already
                  computed on mandate creation or the detail page's "Find
                  matches" click, so this costs zero new AI calls here; it's
                  just surfacing signal that used to require opening the
                  mandate first. */}
              {m.topMatch && (
                <div className="flex items-center gap-1.5 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-[12px] text-slate-600 dark:text-slate-400 min-w-0">
                  <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span className="shrink-0 text-slate-400">Top match</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.topMatch.name}</span>
                  <Badge tone="accent" size="sm" className="normal-case tracking-normal ml-auto shrink-0">
                    {m.topMatch.score}%
                  </Badge>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {mandates.length === 0 && (
        <EmptyState title="No mandates match this view" description="Try a different status filter, or create a new mandate." />
      )}

      {/* Slide-over quick view */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30 transition-opacity duration-200 ease-ros"
            onClick={() => setOpenId(null)}
          />
          <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-ros-md flex flex-col animate-fade-in">
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate">{open.role_title}</p>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3 h-3" /> {open.client_name}
                </p>
              </div>
              <button
                onClick={() => setOpenId(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200 ease-ros shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[open.status] ?? "neutral"} className="normal-case tracking-normal">
                  {open.status.replace("_", " ")}
                </Badge>
                {open.city && (
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {open.city}
                  </span>
                )}
                <span className="text-[12px] text-slate-500 dark:text-slate-400">
                  {open.category?.replace("_", " ")} · {open.sub_domain}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-ros-lg border border-slate-100 dark:border-slate-800 px-3 py-2.5 text-center">
                  <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{open.daysOpen}</p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">Days open</p>
                </div>
                <div className="rounded-ros-lg border border-slate-100 dark:border-slate-800 px-3 py-2.5 text-center">
                  <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{open.linked}</p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">Linked</p>
                </div>
                <div className="rounded-ros-lg border border-slate-100 dark:border-slate-800 px-3 py-2.5 text-center">
                  <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{open.submitted}</p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">Submitted+</p>
                </div>
              </div>

              {open.topMatch && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-indigo-500" /> AI top match
                  </p>
                  <Link
                    href={`/candidates/${open.topMatch.candidateId}`}
                    className="block rounded-ros-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 hover:bg-indigo-50 transition-colors duration-200 ease-ros"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100">{open.topMatch.name}</span>
                      <Badge tone="accent" size="sm" className="normal-case tracking-normal">
                        {open.topMatch.score}% fit
                      </Badge>
                    </div>
                    <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-snug">{open.topMatch.reason}</p>
                  </Link>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Health signals
                </p>
                {open.signals.length === 0 ? (
                  <p className="text-[13px] text-slate-500 dark:text-slate-400">No issues flagged — this mandate looks healthy.</p>
                ) : (
                  <div className="space-y-2">
                    {open.signals.map((s) => (
                      <div
                        key={s.label}
                        className={`flex items-start gap-2 rounded-ros-md px-3 py-2 text-[12.5px] ${
                          s.tone === "danger" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <Link href={`/mandates/${open.id}`}>
                <Button className="w-full" icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
                  Open full mandate
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
