import Link from "next/link";
import { UserCog, Phone, UploadCloud } from "lucide-react";

// Execution-audit gap: "what does a recruiter do when they have zero active
// mandates" had no answer anywhere in the product -- their day just went
// quiet. Shown only when the current recruiter has no assignment on any
// open mandate, this points at the two things worth doing instead:
// finishing incomplete profiles already in the system (so they're
// match-ready the moment a mandate does open), and building future pipeline
// by sourcing/bulk-uploading new candidates ahead of demand rather than
// scrambling after a mandate lands.
export default function NoMandatesCard({ incompleteProfileCount }: { incompleteProfileCount: number }) {
  return (
    <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 mb-4">
      <h2 className="text-[13px] font-semibold text-indigo-900 dark:text-indigo-200 mb-1">
        No active mandates assigned to you right now
      </h2>
      <p className="text-[12px] text-indigo-700/80 dark:text-indigo-300/70 mb-3">
        Worth spending the time on pipeline-building instead of waiting for one to land:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Link
          href="/candidates?incomplete=1"
          className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-indigo-100 dark:border-indigo-900 px-3 py-2.5 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20"
        >
          <UserCog className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-[12px] text-slate-700 dark:text-slate-300">
            <span className="font-medium">{incompleteProfileCount}</span> incomplete profile
            {incompleteProfileCount === 1 ? "" : "s"} to complete
          </span>
        </Link>
        <Link
          href="/candidates?incomplete=1"
          className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-indigo-100 dark:border-indigo-900 px-3 py-2.5 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20"
        >
          <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-[12px] text-slate-700 dark:text-slate-300">Call new candidates for outreach</span>
        </Link>
        <Link
          href="/candidates/bulk-upload"
          className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-indigo-100 dark:border-indigo-900 px-3 py-2.5 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20"
        >
          <UploadCloud className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-[12px] text-slate-700 dark:text-slate-300">Bulk upload candidates for future pipeline</span>
        </Link>
      </div>
    </div>
  );
}
