import Link from "next/link";

// The row of views inside one analytics tab (for example Revenue: overview, billing, FY targets).
export default function SegTabs({ base, current, views }: { base: string; current: string; views: { key: string; label: string }[] }) {
  return (
    <div className="mx-auto mb-1 flex max-w-[1500px] flex-wrap items-center gap-1 px-5 pt-4">
      {views.map((v) => (
        <Link
          key={v.key}
          href={`${base}?view=${v.key}`}
          className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${current === v.key ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
