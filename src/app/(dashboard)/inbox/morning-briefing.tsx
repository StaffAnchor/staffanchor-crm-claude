import Link from "next/link";
import { CalendarClock, Clock, Sparkles, MessageSquareWarning, IndianRupee, Target, PhoneCall } from "lucide-react";

// The "operating center" view from the ROS product direction: instead of a
// recruiter piecing together "what does my day look like" from three boxes
// and a scorecard, this assembles it into one line-of-sight strip at the
// very top -- interviews today, what's overdue, what came in overnight
// worth calling first, which clients are waiting on you, and a running
// revenue forecast off your own live pipeline. Every number here is a
// cheap, already-indexed query (get_my_morning_briefing()) -- nothing
// cached, nothing AI-generated, so it's always exactly current and never
// costs a Gemini call.
export default function MorningBriefing({
  firstName,
  interviewsToday,
  overdueFollowups,
  hotProfilesOvernight,
  clientsWaiting,
  predictedBillingLakhs,
  topMandate,
  leadsNeedingFollowup,
  predictedNewClientValueLakhs,
}: {
  firstName: string;
  interviewsToday: number;
  overdueFollowups: number;
  hotProfilesOvernight: number;
  clientsWaiting: number;
  predictedBillingLakhs: number;
  topMandate: string | null;
  leadsNeedingFollowup: number;
  predictedNewClientValueLakhs: number;
}) {
  const tiles = [
    {
      icon: CalendarClock,
      value: interviewsToday,
      label: interviewsToday === 1 ? "interview today" : "interviews today",
      tint: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    },
    {
      icon: Clock,
      value: overdueFollowups,
      label: overdueFollowups === 1 ? "follow-up overdue" : "follow-ups overdue",
      tint: overdueFollowups > 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
    },
    {
      icon: Sparkles,
      value: hotProfilesOvernight,
      label: hotProfilesOvernight === 1 ? "hot profile overnight" : "hot profiles overnight",
      tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
    {
      icon: MessageSquareWarning,
      value: clientsWaiting,
      label: clientsWaiting === 1 ? "client waiting" : "clients waiting",
      tint: clientsWaiting > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
    },
    {
      icon: PhoneCall,
      value: leadsNeedingFollowup,
      label: leadsNeedingFollowup === 1 ? "prospect gone quiet" : "prospects gone quiet",
      tint: leadsNeedingFollowup > 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
      href: "/sales",
    },
  ];

  return (
    <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/30 dark:to-slate-900 p-5 mb-4">
      <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 mb-3">Good morning, {firstName}.</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-3">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <div key={i} className={`rounded-lg px-3 py-2.5 ${t.tint}`}>
              <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[20px] font-bold tabular-nums leading-none">{t.value}</span>
              </div>
              <p className="text-[11px] font-medium mt-1 leading-tight">{t.label}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[12.5px] text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5 text-teal-600" />
          Predicted billing this month:{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            ₹{predictedBillingLakhs.toLocaleString("en-IN")}L
          </span>
        </span>
        {topMandate && (
          <span className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-teal-600" />
            Highest priority: <span className="font-semibold text-slate-900 dark:text-slate-100">{topMandate}</span>
          </span>
        )}
        {predictedNewClientValueLakhs > 0 && (
          <Link href="/sales" className="flex items-center gap-1.5 hover:text-teal-700 dark:hover:text-teal-400 transition-colors">
            <IndianRupee className="w-3.5 h-3.5 text-teal-600" />
            Forecasted new-client pipeline:{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              ₹{predictedNewClientValueLakhs.toLocaleString("en-IN")}L
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
