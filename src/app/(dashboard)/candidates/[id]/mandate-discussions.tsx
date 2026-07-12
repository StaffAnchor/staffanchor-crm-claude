import { MessagesSquare } from "lucide-react";

export type MandateDiscussionSummary = {
  mandate_id: string;
  client_name: string;
  role_title: string;
  summary: string;
  tags: string[];
  created_at: string;
};

// Permanent, cross-mandate log of what was actually learned about this
// candidate during screening calls -- distinct from the recruiter
// assessment scorecard (which is one global blob), this grows one entry per
// mandate they've been screened against, so a recruiter picking this
// candidate up for a *different* mandate six months from now can see what
// was already established rather than starting from zero.
export default function MandateDiscussions({ entries }: { entries: MandateDiscussionSummary[] }) {
  if (!entries?.length) return null;

  const sorted = [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-1">
        <MessagesSquare className="w-3.5 h-3.5 text-slate-400" /> Mandate discussions
      </h2>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
        AI-structured notes from past mandate screening calls -- reusable context for any future mandate.
      </p>
      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
        {sorted.map((entry, i) => (
          <div key={`${entry.mandate_id}-${i}`} className="rounded-ros-lg border border-slate-200 dark:border-slate-700 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200 truncate">
                {entry.role_title} <span className="text-slate-400 font-normal">· {entry.client_name}</span>
              </p>
              <p className="text-[10px] text-slate-400 shrink-0">
                {new Date(entry.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </div>
            <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-snug">{entry.summary}</p>
            {entry.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
