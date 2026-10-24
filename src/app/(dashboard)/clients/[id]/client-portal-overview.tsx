import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";

export type SharedCandidate = {
  linkId: string;
  mandateId: string;
  candidateId: string;
  name: string;
  feedback: string | null;
  interviewRequested: boolean;
  interviewConfirmed: boolean;
  decidedAt: string | null;
};
export type PortalRole = { id: string; title: string; status: string; city: string | null };

const FEEDBACK: Record<string, { label: string; cls: string }> = {
  interested: { label: "Interested", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  not_interested: { label: "Not interested", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
};

const portalUrl = "https://jobs.staffanchor.com/client-portal";

// What this client sees when they sign in: each of their roles, and the people you have shared on it (in_shortlist).
// The client portal itself needs the client's own login, so this is the same list from the staff side.
export default function ClientPortalOverview({ clientName, roles, shared }: { clientName: string; roles: PortalRole[]; shared: SharedCandidate[] }) {
  const byRole = new Map<string, SharedCandidate[]>();
  for (const s of shared) byRole.set(s.mandateId, [...(byRole.get(s.mandateId) ?? []), s]);
  const waiting = shared.filter((s) => !s.feedback).length;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">What {clientName} sees</h2>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
            Each role and the people you have shared on it. {shared.length === 0 ? "Nothing is shared yet." : `${shared.length} shared, ${waiting} waiting for their feedback.`}
          </p>
        </div>
        <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-ros-md bg-teal-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-teal-700">
          Open the client portal <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {roles.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-400">No roles for this client yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {roles.map((r) => {
            const list = byRole.get(r.id) ?? [];
            return (
              <li key={r.id} className="py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/mandates/${r.id}`} className="text-[14px] font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">
                      {r.title}
                    </Link>
                    <span className="ml-2 text-[12.5px] text-slate-500">
                      {r.status.replace("_", " ")}
                      {r.city ? ` · ${r.city}` : ""}
                    </span>
                  </div>
                  <Link href={`/mandates/${r.id}#sharing`} className="text-[12.5px] font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 dark:text-teal-300">
                    Shortlist link and sharing
                  </Link>
                </div>
                {list.length === 0 ? (
                  <p className="mt-1.5 text-[13px] text-slate-400">Nobody shared on this role yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {list.map((c) => {
                      const fb = c.feedback ? FEEDBACK[c.feedback] : null;
                      return (
                        <li key={c.linkId} className="flex flex-wrap items-center gap-2 text-[13px]">
                          <Link href={`/candidates/${c.candidateId}?mandateId=${r.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-800 hover:text-teal-700 dark:text-slate-200">
                            {c.name}
                          </Link>
                          <span className={`rounded-full px-2 py-0.5 text-[12px] ring-1 ${fb ? fb.cls : "bg-amber-50 text-amber-800 ring-amber-200"}`}>{fb ? fb.label : "Waiting for feedback"}</span>
                          {c.interviewConfirmed ? <span className="text-[12px] text-emerald-700">Interview confirmed</span> : c.interviewRequested ? <span className="text-[12px] text-sky-700">Interview requested</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
