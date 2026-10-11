// Shown instantly while the Candidates list loads, so a click on any chip or tile responds at once
// instead of leaving the old page frozen until the new one is ready.
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-800";
  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8" aria-busy="true" aria-label="Loading candidates">
      <div className={`${bar} mb-5 h-7 w-56`} />
      <div className="mb-3 rounded-ros-lg border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className={`${bar} mb-3 h-4 w-72`} />
        <div className={`${bar} mb-3 h-2.5 w-full rounded-full`} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className={`${bar} h-44 lg:col-span-3`} />
          <div className={`${bar} h-44 lg:col-span-3`} />
          <div className={`${bar} h-44 lg:col-span-6`} />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className={`${bar} h-7 w-28 rounded-full`} />
        ))}
      </div>
      <div className="rounded-ros-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800">
            <div className={`${bar} h-8 w-8 rounded-full`} />
            <div className={`${bar} h-4 w-48`} />
            <div className={`${bar} h-4 w-24`} />
            <div className={`${bar} ml-auto h-4 w-32`} />
          </div>
        ))}
      </div>
    </div>
  );
}
