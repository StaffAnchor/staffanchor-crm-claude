"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Clock,
  Gift,
  RefreshCcw,
  Flame,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Row shape from get_sales_briefing() -- the Sales module's own version of
// the Priority Actions Inbox, reusing the same recruiter_inbox table +
// resolve_inbox_item/snooze_inbox_item RPCs (extended with a lead_id FK)
// rather than building a parallel system. This is the "daily AI briefing"
// half of the 4-5-AEs-worth-of-help ask -- the four SALES_* task types are
// produced by sweep_sales_briefing(), which runs daily via
// /api/cron/sales-briefing-sweep.
export type SalesBriefingItem = {
  id: string;
  created_at: string;
  task_type: string;
  title: string;
  detail: string | null;
  priority: "low" | "normal" | "high";
  status: "open" | "snoozed" | "done" | "dismissed";
  snoozed_until: string | null;
  lead_id: string | null;
  lead_company_name: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  client_id: string | null;
  client_name: string | null;
  recruiter_id: string | null;
  recruiter_name: string | null;
  is_unassigned: boolean;
};

const TASK_META: Record<string, { icon: typeof Flame; label: string; tint: string }> = {
  SALES_LEAD_FOLLOWUP_DUE: {
    icon: Clock,
    label: "Follow-up due",
    tint: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  SALES_LEAD_STALE: {
    icon: Flame,
    label: "Gone quiet",
    tint: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  SALES_REFERRAL_ASK: {
    icon: Gift,
    label: "Referral ask",
    tint: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  SALES_CLIENT_CHECKIN: {
    icon: RefreshCcw,
    label: "Client check-in",
    tint: "bg-sky-50 text-sky-700 ring-sky-200",
  },
};

function metaFor(taskType: string) {
  return (
    TASK_META[taskType] ?? {
      icon: Sparkles,
      label: "Action needed",
      tint: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200",
    }
  );
}

export default function SalesBriefingPanel({
  initialItems,
  fetchError,
}: {
  initialItems: SalesBriefingItem[];
  fetchError: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const open = items.filter((i) => i.status === "open" || i.status === "snoozed");

  async function markDone(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("resolve_inbox_item", { p_id: id, p_status: "done" });
    setBusyId(null);
    if (error) {
      window.alert(`Couldn't mark done: ${error.message}`);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    router.refresh();
  }

  async function snooze(id: string) {
    setBusyId(id);
    const until = new Date();
    until.setDate(until.getDate() + 3);
    const { error } = await supabase.rpc("snooze_inbox_item", { p_id: id, p_until: until.toISOString() });
    setBusyId(null);
    if (error) {
      window.alert(`Couldn't snooze: ${error.message}`);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    router.refresh();
  }

  return (
    <Card className="mb-4" padded={false}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-5 py-3.5"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Today&apos;s Briefing</h2>
          {open.length > 0 && (
            <Badge tone="accent" size="sm">
              {open.length} to work
            </Badge>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          {fetchError && <p className="text-[12px] text-rose-500">Couldn&apos;t load briefing: {fetchError}</p>}
          {!fetchError && open.length === 0 && (
            <p className="text-[12.5px] text-slate-400">
              Nothing needs your attention right now — follow-ups, referral asks, and client check-ins will show up here as they come due.
            </p>
          )}
          <div className="space-y-2">
            {open.map((item) => {
              const meta = metaFor(item.task_type);
              const Icon = meta.icon;
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-ros-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-3 py-2.5"
                >
                  <span className={`w-6 h-6 rounded-ros-full ring-1 flex items-center justify-center shrink-0 ${meta.tint}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200">
                        {item.lead_id ? (
                          <Link href={`/sales/${item.lead_id}`} className="hover:text-blue-600 transition-colors duration-200 ease-ros">
                            {item.title}
                          </Link>
                        ) : (
                          item.title
                        )}
                      </p>
                      {item.priority === "high" && (
                        <Badge tone="warning" size="sm">
                          Priority
                        </Badge>
                      )}
                    </div>
                    {item.detail && <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">{item.detail}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" disabled={busyId === item.id} onClick={() => snooze(item.id)}>
                      Snooze
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => markDone(item.id)}
                      icon={busyId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
