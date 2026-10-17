import { ArrowRight } from "lucide-react";

export type NextActionItem = { text: string; href?: string; cta?: string };

/** One line at the top of a page: the single most useful thing to do next. Calm when nothing is needed. */
export default function NextAction({ item }: { item: NextActionItem | null }) {
  if (!item) return null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 dark:border-teal-900 dark:bg-teal-950/30">
      <span className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Next</span>
      <p className="flex-1 text-sm text-slate-800 dark:text-slate-100">{item.text}</p>
      {item.href && (
        <a href={item.href} className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline dark:text-teal-300">
          {item.cta ?? "Open"} <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
