import Link from "next/link";
import { GAP_LABEL, isGate, isVital } from "@/lib/completion";

// Shown after a call is saved: what is still not on the profile, current pay and CV first, then the other vitals, then the rest.
// When a person is one field short of complete, this is the moment to fix it.
export default function StillMissing({ name, candidateId, gaps, link = true }: { name: string; candidateId?: string; gaps: string[]; link?: boolean }) {
  if (gaps.length === 0) {
    return <p className="mt-0.5 font-semibold text-emerald-800 dark:text-emerald-300">{name}&apos;s profile is complete: nothing is missing.</p>;
  }
  const ordered = [...gaps.filter(isGate), ...gaps.filter((g) => isVital(g) && !isGate(g)), ...gaps.filter((g) => !isVital(g))];
  return (
    <p className="mt-0.5 rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      Still missing for {name}: {ordered.map((g) => GAP_LABEL[g] ?? g).join(", ")}.
      {link && candidateId && (
        <>
          {" "}
          <Link href={`/candidates/${candidateId}`} target="_blank" rel="noopener noreferrer" className="underline">
            Fix on the profile
          </Link>
        </>
      )}
    </p>
  );
}
