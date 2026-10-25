import Link from "next/link";
import { AlertTriangle, FileQuestion, TrendingUp } from "lucide-react";
import {
  GROUP_BAR,
  GROUP_BLURB,
  GROUP_LABEL,
  SUBGROUPS_BY_GROUP,
  type GroupOverview,
  type CvCoverage,
  type ProfileGroup,
} from "@/lib/profile-groups";

const ORDER: ProfileGroup[] = ["b2b_sales", "b2c_sales", "non_sales"];
const ACCENT: Record<
  ProfileGroup,
  { ring: string; text: string; soft: string }
> = {
  b2b_sales: {
    ring: "ring-teal-400",
    text: "text-teal-700 dark:text-teal-300",
    soft: "from-teal-50 to-white dark:from-teal-950/30 dark:to-slate-900",
  },
  b2c_sales: {
    ring: "ring-emerald-400",
    text: "text-emerald-700 dark:text-emerald-300",
    soft: "from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900",
  },
  non_sales: {
    ring: "ring-amber-400",
    text: "text-amber-800 dark:text-amber-300",
    soft: "from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900",
  },
  unclear: {
    ring: "ring-slate-400",
    text: "text-slate-600 dark:text-slate-300",
    soft: "from-slate-50 to-white dark:from-slate-800/40 dark:to-slate-900",
  },
};

// The top of the Candidates page: the whole talent pool at a glance, grouped by what people actually
// do (from their CVs), with one click into any group or sub-group.
export default function ProfileGroupsStrip({
  overview,
  activeGroup,
  activeSubgroup,
  hrefFor,
  coverage,
}: {
  overview: GroupOverview;
  activeGroup?: string;
  activeSubgroup?: string;
  hrefFor: (group?: string, subgroup?: string) => string;
  coverage?: CvCoverage | null;
}) {
  const total = Math.max(1, overview.total);
  const count = (g: ProfileGroup) => overview.groups[g]?.n ?? 0;
  const pct = (n: number) => Math.round((n / total) * 100);
  // Each group's sub-groups, biggest first. Names come from one fixed list shared with the sorting in the database.
  const subRowsFor = (g: ProfileGroup) =>
    (SUBGROUPS_BY_GROUP[g as keyof typeof SUBGROUPS_BY_GROUP] ?? [])
      .map((name) => ({ name, n: overview.subgroups[name] ?? 0 }))
      .filter((s) => s.n > 0)
      .sort((a, b) => b.n - a.n);
  const legend: ProfileGroup[] = [
    "b2b_sales",
    "b2c_sales",
    "non_sales",
    "unclear",
  ];

  return (
    <section
      aria-label="Talent pool by profile group"
      className="mb-3 rounded-ros-lg border border-slate-100 bg-white p-4 shadow-ros-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            Your talent pool, grouped by what people do
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Worked out from each candidate&apos;s CV, kept up to date as new
            profiles arrive. Click a group to filter the list.
          </p>
        </div>
        {activeGroup && (
          <Link
            href={hrefFor(undefined, undefined)}
            className="text-[12px] font-medium text-teal-600 hover:underline"
          >
            Clear group filter
          </Link>
        )}
      </div>

      {/* One bar showing the whole pool. */}
      <div
        className="mb-1 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="img"
        aria-label="Share of profiles by group"
      >
        {legend.map((g) =>
          count(g) > 0 ? (
            <Link target="_blank" rel="noopener noreferrer"
              key={g}
              href={hrefFor(g, undefined)}
              className={`${GROUP_BAR[g]} transition hover:opacity-80`}
              style={{ width: `${(count(g) / total) * 100}%` }}
              title={`${GROUP_LABEL[g]}: ${count(g)}`}
              aria-label={`${GROUP_LABEL[g]}: ${count(g)}`}
            />
          ) : null,
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {legend.map((g) => (
          <Link target="_blank" rel="noopener noreferrer"
            key={g}
            href={hrefFor(g, undefined)}
            className="inline-flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <span className={`h-2 w-2 rounded-full ${GROUP_BAR[g]}`} />{" "}
            {GROUP_LABEL[g]} {count(g)} ({pct(count(g))}%)
          </Link>
        ))}
      </div>

      {coverage && (
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {coverage.total} profiles · {coverage.with_cv_file} with a CV file ·{" "}
          {coverage.cv_read} CVs read · {coverage.no_cv_file} without a CV file.
          The groups above count profiles, so they add up to {coverage.total}.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {ORDER.map((g) => {
          const info = overview.groups[g];
          const n = info?.n ?? 0;
          const active = activeGroup === g && !activeSubgroup;
          const verified =
            n > 0 ? Math.round(((info?.high ?? 0) / n) * 100) : 0;
          const isNon = g === "non_sales";
          return (
            <div
              key={g}
              className={`flex flex-col rounded-xl bg-gradient-to-br p-3.5 ring-1 transition ${active ? `${ACCENT[g].ring} ring-2` : "ring-slate-200 dark:ring-slate-700"} ${ACCENT[g].soft} ${isNon ? "lg:col-span-6" : "lg:col-span-3"}`}
            >
              <Link target="_blank" rel="noopener noreferrer" href={hrefFor(g, undefined)} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p
                      className={`text-[12px] font-semibold uppercase tracking-wide ${ACCENT[g].text}`}
                    >
                      {GROUP_LABEL[g]}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {GROUP_BLURB[g]}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                    {pct(n)}%
                  </span>
                </div>
                <p className="mt-2 text-[30px] font-bold leading-none tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                  {n}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {(info?.new7 ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                      <TrendingUp className="h-3 w-3" /> {info?.new7} new this
                      week
                    </span>
                  )}
                </div>
              </Link>

              {(() => {
                const rows = subRowsFor(g);
                const maxSub = Math.max(1, ...rows.map((r) => r.n));
                return (
                  <div className={`mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 ${isNon ? "sm:grid-cols-2" : ""}`}>
                    {rows.map((sRow) => {
                      const subActive = activeGroup === g && activeSubgroup === sRow.name;
                      return (
                        <Link target="_blank" rel="noopener noreferrer"
                          key={sRow.name}
                          href={hrefFor(g, sRow.name)}
                          className={`group rounded-md px-1.5 py-1 transition hover:bg-white/80 dark:hover:bg-slate-800/60 ${subActive ? "bg-white ring-1 ring-slate-300 dark:bg-slate-800" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <span className="leading-tight text-slate-700 dark:text-slate-200">{sRow.name}</span>
                            <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">{sRow.n}</span>
                          </div>
                          <div className="mt-0.5 h-1 rounded-full bg-white/70 dark:bg-slate-800/60">
                            <div className={`h-1 rounded-full ${GROUP_BAR[g]}`} style={{ width: `${Math.max(6, (sRow.n / maxSub) * 100)}%` }} />
                          </div>
                        </Link>
                      );
                    })}
                    {rows.length === 0 && <p className="text-[12px] text-slate-400">Nothing sorted here yet.</p>}
                  </div>
                );
              })()}
              <div
                className="mt-auto pt-3"
                title="Profiles where a read CV makes the group clear. The rest are grouped from the title and may be refined when a CV is read."
              >
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Confirmed from CV</span>
                  <span className="tabular-nums font-medium">{verified}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/80 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700">
                  <div
                    className={`h-1.5 rounded-full ${GROUP_BAR[g]}`}
                    style={{ width: `${verified}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Link target="_blank" rel="noopener noreferrer"
          href={hrefFor("review", undefined)}
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[12.5px] transition hover:bg-slate-50 dark:hover:bg-slate-800 ${activeGroup === "review" ? "border-rose-300 bg-rose-50/60 dark:border-rose-800 dark:bg-rose-950/20" : "border-slate-200 dark:border-slate-700"}`}
        >
          <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <AlertTriangle className="h-4 w-4 text-rose-500" /> Needs a look
            <span className="text-xs text-slate-400">
              CV and profile disagree, or the group is unclear
            </span>
          </span>
          <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {overview.needs_review}
          </span>
        </Link>
        <Link target="_blank" rel="noopener noreferrer"
          href={hrefFor("unread", undefined)}
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[12.5px] transition hover:bg-slate-50 dark:hover:bg-slate-800 ${activeGroup === "unread" ? "border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800" : "border-slate-200 dark:border-slate-700"}`}
        >
          <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <FileQuestion className="h-4 w-4 text-slate-400" /> CV not read yet
            <span className="text-xs text-slate-400">
              has a CV; grouped from the title until it is read
            </span>
          </span>
          <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {coverage?.cv_unread ?? 0}
          </span>
        </Link>
        <Link target="_blank" rel="noopener noreferrer"
          href={hrefFor("nocv", undefined)}
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[12.5px] transition hover:bg-slate-50 dark:hover:bg-slate-800 ${activeGroup === "nocv" ? "border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800" : "border-slate-200 dark:border-slate-700"}`}
        >
          <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <FileQuestion className="h-4 w-4 text-slate-400" /> No CV on file
            <span className="text-xs text-slate-400">
              ask the candidate for a CV
            </span>
          </span>
          <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {coverage?.no_cv_file ?? 0}
          </span>
        </Link>
      </div>
    </section>
  );
}
