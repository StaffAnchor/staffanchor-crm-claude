import { MessageSquare, RefreshCw, UserPlus } from "lucide-react";

type TimelineEvent = {
  id: string;
  at: string;
  kind: "note" | "status_change" | "created";
  label: string;
  detail?: string;
};

const ICON: Record<TimelineEvent["kind"], typeof MessageSquare> = {
  note: MessageSquare,
  status_change: RefreshCw,
  created: UserPlus,
};

// Softer, calmer icon-chip colors -- part of the "one neutral surface, one
// restrained accent" palette used across the redesigned pages, rather than
// the previous blue/violet/emerald rainbow.
const ICON_COLOR: Record<TimelineEvent["kind"], string> = {
  note: "bg-blue-50 text-blue-600",
  status_change: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  created: "bg-emerald-50 text-emerald-600",
};

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-[13px] text-slate-400 text-center py-8">No activity yet.</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((e, i) => {
        const Icon = ICON[e.kind];
        return (
          <div key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-ros-full flex items-center justify-center shrink-0 transition-colors duration-200 ease-ros ${ICON_COLOR[e.kind]}`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              </div>
              {i < events.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-1" />}
            </div>
            <div className="pb-5">
              <p className="text-[13px] text-slate-800 dark:text-slate-200">{e.label}</p>
              {e.detail && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{e.detail}</p>}
              <p className="text-[11px] text-slate-400 mt-1">{new Date(e.at).toLocaleString()}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
