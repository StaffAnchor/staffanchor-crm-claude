import Link from "next/link";
import { CalendarClock, Clock, CheckCircle2, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import InterviewRowActions from "./interview-row-actions";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type InterviewRow = {
  id: string;
  candidate_id: string;
  mandate_id: string;
  stage: string;
  client_feedback: string | null;
  requested_interview_at: string | null;
  confirmed_interview_at: string | null;
  candidate_name: string;
  role_title: string;
  client_name: string;
  recruiter_name: string;
};

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

// "Daily Agenda" grouping -- Today / Tomorrow / named weekday within the
// next week / full date beyond that, mirroring how a calendar app labels
// upcoming days rather than a flat undifferentiated list.
function dayLabel(iso: string, now: Date) {
  const d = new Date(iso);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d);
  startOfDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfDay.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

export default async function InterviewsPage() {
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "id, candidate_id, mandate_id, stage, client_feedback, requested_interview_at, confirmed_interview_at, added_by, candidates(full_name), mandates(role_title, client_name)"
    )
    .in("stage", ["client_interview"])
    .order("requested_interview_at", { ascending: true, nullsFirst: false });

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  const profileNames: Record<string, string> = {};
  (profiles ?? []).forEach((p) => {
    profileNames[p.id] = p.full_name ?? p.email ?? "Unknown";
  });

  type RawRow = {
    id: string;
    candidate_id: string;
    mandate_id: string;
    stage: string;
    client_feedback: string | null;
    requested_interview_at: string | null;
    confirmed_interview_at: string | null;
    added_by: string | null;
    candidates: { full_name: string } | { full_name: string }[] | null;
    mandates: { role_title: string; client_name: string } | { role_title: string; client_name: string }[] | null;
  };

  const rows: InterviewRow[] = ((links ?? []) as RawRow[]).map((l) => {
    const candidate = Array.isArray(l.candidates) ? l.candidates[0] : l.candidates;
    const mandate = Array.isArray(l.mandates) ? l.mandates[0] : l.mandates;
    return {
      id: l.id,
      candidate_id: l.candidate_id,
      mandate_id: l.mandate_id,
      stage: l.stage,
      client_feedback: l.client_feedback,
      requested_interview_at: l.requested_interview_at,
      confirmed_interview_at: l.confirmed_interview_at,
      candidate_name: candidate?.full_name ?? "Unknown candidate",
      role_title: mandate?.role_title ?? "Unknown role",
      client_name: mandate?.client_name ?? "Unknown client",
      recruiter_name: l.added_by ? profileNames[l.added_by] ?? "Unknown recruiter" : "Unassigned",
    };
  });

  const now = new Date();
  const needsScheduling = rows.filter((r) => !r.confirmed_interview_at);
  const upcoming = rows
    .filter((r) => r.confirmed_interview_at && new Date(r.confirmed_interview_at).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.confirmed_interview_at!).getTime() - new Date(b.confirmed_interview_at!).getTime());
  const past = rows
    .filter((r) => r.confirmed_interview_at && new Date(r.confirmed_interview_at).getTime() < now.getTime())
    .sort((a, b) => new Date(b.confirmed_interview_at!).getTime() - new Date(a.confirmed_interview_at!).getTime());

  const todayKey = dayKey(now.toISOString());
  const todayCount = upcoming.filter((r) => dayKey(r.confirmed_interview_at!) === todayKey).length;

  // Group the upcoming, confirmed interviews into day buckets -- the heart
  // of the "Daily Agenda" view -- preserving chronological order both
  // across days and within each day.
  const agendaGroups: { key: string; label: string; rows: InterviewRow[] }[] = [];
  upcoming.forEach((r) => {
    const key = dayKey(r.confirmed_interview_at!);
    let group = agendaGroups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: dayLabel(r.confirmed_interview_at!, now), rows: [] };
      agendaGroups.push(group);
    }
    group.rows.push(r);
  });

  const statTiles = [
    { label: "Today", value: todayCount, icon: CalendarDays, accent: true },
    { label: "Upcoming, confirmed", value: upcoming.length, icon: CalendarClock },
    { label: "Needs scheduling", value: needsScheduling.length, icon: Clock },
    { label: "Awaiting outcome", value: past.length, icon: CheckCircle2 },
  ];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Interviews</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            Every candidate currently at the client-interview stage, across all mandates.
          </p>
        </div>
      </div>

      <div className="bg-slate-50/60 dark:bg-slate-800/50 rounded-ros-lg p-2 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statTiles.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label}>
                <StatTile label={t.label} value={t.value} icon={<Icon className="w-4 h-4" strokeWidth={2} />} accent={t.accent} />
              </div>
            );
          })}
        </div>
      </div>

      <SimpleSection
        icon={<Clock className="w-4 h-4 text-amber-500" />}
        title="Needs scheduling"
        subtitle="Client requested an interview (or the recruiter moved them here) — confirm a final date/time."
        rows={needsScheduling}
        emptyLabel="Nothing waiting on scheduling right now."
      />

      {/* Daily Agenda -- confirmed interviews grouped by day, the way a
          calendar app would lay out "what's on today, then tomorrow, then
          later this week" instead of one flat undifferentiated list. */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily agenda</h2>
          <span className="text-[10.5px] text-slate-400 ml-auto">{upcoming.length}</span>
        </div>
        <p className="text-[11.5px] text-slate-400 mb-4">Confirmed interviews, grouped by day.</p>

        {agendaGroups.length === 0 ? (
          <p className="text-[13px] text-slate-400">No confirmed upcoming interviews.</p>
        ) : (
          <div className="space-y-5">
            {agendaGroups.map((g) => (
              <div key={g.key}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  {g.label} <span className="font-normal normal-case text-slate-400">· {g.rows.length}</span>
                </p>
                <div className="divide-y divide-slate-100">
                  {g.rows.map((r) => (
                    <InterviewListRow key={r.id} row={r} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SimpleSection
        icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        title="Past interviews awaiting outcome"
        subtitle="Interview time has passed — log what happened."
        rows={past}
        emptyLabel="Nothing here."
      />
    </div>
  );
}

function InterviewListRow({ row }: { row: InterviewRow }) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0">
        <Link
          href={`/candidates/${row.candidate_id}`}
          className="text-[13px] font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors duration-200 ease-ros truncate"
        >
          {row.candidate_name}
        </Link>
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
          {row.role_title} ·{" "}
          <Link href={`/mandates/${row.mandate_id}`} className="hover:text-blue-600 transition-colors duration-200 ease-ros">
            {row.client_name}
          </Link>{" "}
          · {row.recruiter_name}
        </p>
      </div>
      <InterviewRowActions row={row} />
    </div>
  );
}

function SimpleSection({
  icon,
  title,
  subtitle,
  rows,
  emptyLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  rows: InterviewRow[];
  emptyLabel: string;
}) {
  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <span className="text-[10.5px] text-slate-400 ml-auto">{rows.length}</span>
      </div>
      <p className="text-[11.5px] text-slate-400 mb-4">{subtitle}</p>
      {rows.length === 0 ? (
        <EmptyState title={emptyLabel} className="py-8" />
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <InterviewListRow key={r.id} row={r} />
          ))}
        </div>
      )}
    </Card>
  );
}
