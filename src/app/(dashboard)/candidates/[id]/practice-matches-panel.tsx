import Link from "next/link";
import { PracticeMatchChip } from "@/components/practice-match-chip";
import { matchMandatesForPractice, SENIORITY_LABEL, type PracticeMandate } from "@/lib/practice-pool";

type CandidatePractice = { practice_id: string; seniority_band: string; is_primary: boolean };
type Practice = { id: string; name: string };

// Single-candidate slice of the Practice Pool page (/practice-pool) --
// same matchMandatesForPractice logic, scoped to just the practice tag(s)
// on this one profile, so a recruiter looking at a candidate they already
// have open can immediately see every other open mandate worth pitching
// them to, without leaving the page to check the pool-wide view.
export default function PracticeMatchesPanel({
  candidateId,
  candidatePractices,
  allPractices,
  mandates,
  alreadyLinkedMandateIds,
}: {
  candidateId: string;
  candidatePractices: CandidatePractice[];
  allPractices: Practice[];
  mandates: PracticeMandate[];
  alreadyLinkedMandateIds: Set<string>;
}) {
  if (candidatePractices.length === 0) {
    return (
      <p className="text-[12px] text-slate-400">
        Not tagged into a practice yet -- add one above to surface matching open mandates here.
      </p>
    );
  }

  const practiceMap = new Map(allPractices.map((p) => [p.id, p]));

  const groups = candidatePractices.map((cp) => {
    const practice = practiceMap.get(cp.practice_id);
    const { exact, near } = matchMandatesForPractice(mandates, cp.practice_id, cp.seniority_band, alreadyLinkedMandateIds);
    return { cp, practice, exact, near };
  });

  const totalMatches = groups.reduce((sum, g) => sum + g.exact.length + g.near.length, 0);

  if (totalMatches === 0) {
    return <p className="text-[12px] text-slate-400">No open mandates match this candidate&apos;s practice(s) right now.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map(({ cp, practice, exact, near }) => {
        if (exact.length === 0 && near.length === 0) return null;
        return (
          <div key={cp.practice_id}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {practice?.name ?? "—"} · {SENIORITY_LABEL[cp.seniority_band] ?? cp.seniority_band}
            </p>
            {exact.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {exact.map((m) => (
                  <PracticeMatchChip key={m.id} candidateId={candidateId} mandateId={m.id} roleTitle={m.role_title} clientName={m.client_name} />
                ))}
              </div>
            )}
            {near.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <span className="text-[10.5px] text-slate-400 mr-0.5">Adjacent band:</span>
                {near.map((m) => (
                  <PracticeMatchChip key={m.id} candidateId={candidateId} mandateId={m.id} roleTitle={m.role_title} clientName={m.client_name} dim />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Link href="/practice-pool" className="text-[11px] text-blue-600 hover:underline">
        View full Practice Pool →
      </Link>
    </div>
  );
}
