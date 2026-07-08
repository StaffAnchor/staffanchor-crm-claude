import Link from "next/link";
import { CalendarClock, Clock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import InterviewRowActions from "./interview-row-actions";

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

  const now = Date.now();
  const needsScheduling = rows.filter((r) => !r.confirmed_interview_at);
  const upcoming = rows.filter(
    (r) => r.confirmed_interview_at && new Date(r.confirmed_interview_at).getTime() >= now
  );
  const past = rows.filter(
    (r) => r.confirmed_interview_at && new Date(r.confirmed_interview_at).getTime() < now
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold text-slate-900 tracking-tight">Interviews</h1>
        <p className="text-[12.5px] text-slate-500 mt-0.5">
          Every candidate currently at the client-interview stage, across all mandates.
        </p>
      </div>

      <Section
        icon={<Clock className="w-4 h-4 text-amber-500" />}
        title="Needs scheduling"
        subtitle="Client requested an interview (or the recruiter moved them here) — confirm a final date/time."
        rows={needsScheduling}
        emptyLabel="Nothing waiting on scheduling right now."
      />

      <Section
        icon={<CalendarClock className="w-4 h-4 text-cyan-500" />}
        title="Upcoming, confirmed"
        subtitle="Interview date/time is locked in."
        rows={upcoming}
        emptyLabel="No confirmed upcoming interviews."
      />

      <Section
        icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        title="Past interviews awaiting outcome"
        subtitle="Interview time has passed — log what happened."
        rows={past}
        emptyLabel="Nothing here."
      />
    </div>
  );
}

function Section({
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
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-[10.5px] text-slate-400 ml-auto">{rows.length}</span>
      </div>
      <p className="text-[11.5px] text-slate-400 mb-4">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-3 gap-4">
              <div className="min-w-0">
                <Link
                  href={`/candidates/${r.candidate_id}`}
                  className="text-[13px] font-medium text-slate-900 hover:text-blue-600 truncate"
                >
                  {r.candidate_name}
                </Link>
                <p className="text-[11.5px] text-slate-500 truncate">
                  {r.role_title} ·{" "}
                  <Link href={`/mandates/${r.mandate_id}`} className="hover:text-blue-600">
                    {r.client_name}
                  </Link>{" "}
                  · {r.recruiter_name}
                </p>
              </div>
              <InterviewRowActions row={r} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
