import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Timeline, type TimelineEntry } from "@/components/ui/timeline";
import type { ProfileTimelineEntry } from "@/lib/career-timeline";

// The Sales Passport -- one read-only view of "everything that makes this
// person hireable as a sales specialist," shared between two contexts:
// recruiters inside the CRM (viewer="recruiter") and hiring managers on the
// no-login client shortlist link (viewer="client"). The `viewer` prop is the
// single gate for anything that must never leave the building: recruiter
// assessment scores and the overall recommendation are internal-only per the
// existing "Internal only, never shown to clients" rule on the assessment
// panel, so they're rendered only when viewer === "recruiter". Everything
// else here is the same "Revenue Journey" data the candidate themselves
// filled in via the onboarding wizard's Career Timeline step, so there's no
// reason it should read any differently for a client than it does internally.

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function monthLabel(ym: string | null | undefined): string {
  if (!ym) return "—";
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const RECOMMENDATION_TONE: Record<string, BadgeTone> = {
  "Strong Fit": "success",
  "Fit with Reservations": "warning",
  "Not a Fit": "danger",
};

export type SalesPassportProps = {
  viewer: "recruiter" | "client";
  fullName: string;
  currentJobTitle?: string | null;
  currentEmployer?: string | null;
  currentLocation?: string | null;
  totalExperienceYears?: number | null;
  subDomain?: string | null;
  secondarySubDomains?: string[] | null;
  expectedFixedCtc?: number | null;
  currentFixedCtc?: number | null;
  noticePeriod?: string | null;
  /** Recruiter-confirmed relocation answer, set only after a screening call. */
  verifiedRelocation?: string | null;
  /** Candidate's own answer from the onboarding wizard -- shown whenever a
      recruiter hasn't verified relocation yet, so the stat doesn't read
      empty just because no one's had that call. */
  openToRelocation?: string | null;
  verifiedNotice?: string | null;
  currentIndustry?: string | null;
  industries?: string[] | null;
  skills?: string | null;
  segmentData?: Record<string, unknown> | null;
  careerTimeline?: ProfileTimelineEntry[] | null;
  stabilityScore?: number | null;
  stabilityLabel?: string | null;
  domainConsistencyScore?: number | null;
  // Recruiter-only
  scores?: { label: string; value?: number }[];
  recommendation?: string | null;
  redFlags?: string[];
};

function Stat({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-ros-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-[10.5px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{value || "—"}</p>
    </div>
  );
}

export function SalesPassportView(props: SalesPassportProps) {
  const {
    viewer,
    fullName,
    currentJobTitle,
    currentEmployer,
    currentLocation,
    totalExperienceYears,
    subDomain,
    secondarySubDomains,
    expectedFixedCtc,
    currentFixedCtc,
    noticePeriod,
    verifiedRelocation,
    openToRelocation,
    verifiedNotice,
    currentIndustry,
    industries,
    skills,
    segmentData,
    careerTimeline,
    stabilityScore,
    stabilityLabel,
    domainConsistencyScore,
    scores,
    recommendation,
    redFlags,
  } = props;

  const timeline = (careerTimeline ?? [])
    .filter((e) => e.company || e.title)
    .sort((a, b) => (b.start_month || "").localeCompare(a.start_month || ""));

  const timelineEntries: TimelineEntry[] = timeline.map((e) => {
    const tagParts = [e.revenue_generated, e.quota_attainment_band].filter(Boolean);
    return {
      id: e.id,
      title: `${e.title || "Role"}${e.company ? ` at ${e.company}` : ""}`,
      subtitle: [e.sub_domain, e.industry].filter(Boolean).join(" · ") || undefined,
      dateRange: `${monthLabel(e.start_month)} – ${e.end_month ? monthLabel(e.end_month) : "Present"}`,
      tag: tagParts.length > 0 ? { label: tagParts.join(" · "), tone: "accent" as const } : undefined,
      emphasized: e.end_month === null,
    };
  });

  const currentRole = timeline.find((e) => e.end_month === null);
  const hasQuarterlyGrid =
    currentRole &&
    (currentRole.target_q1 || currentRole.target_q2 || currentRole.target_q3 || currentRole.target_q4);

  // segment_data holds a mix of flat scalars (motion, ticket band, role
  // level, ...) and at least one nested object -- revenue_snapshot, written
  // by ApplyForm.tsx's Stage 3 step as {period, target, target_currency,
  // achievement, has_individual_quota, individual_target, ...}. Rendering
  // that object with String(v) produced the literal text "[object Object]";
  // this flattens any nested object into its own labeled sub-rows instead
  // of trying to print it as one value.
  const segmentEntries: [string, unknown][] = Object.entries(segmentData ?? {})
    .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .flatMap(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return Object.entries(v as Record<string, unknown>)
          .filter(([, sv]) => sv !== null && sv !== "" && sv !== undefined)
          .map(([sk, sv]) => [`${humanize(k)} — ${humanize(sk)}`, sv] as [string, unknown]);
      }
      return [[humanize(k), v] as [string, unknown]];
    });

  const revenueDetailFields: [string, string | undefined][] = currentRole
    ? [
        ["Sales motion", currentRole.sales_motion],
        ["Decision-maker persona", currentRole.decision_maker_persona],
        ["Customer type", currentRole.customer_type],
        ["Client tier", currentRole.client_tier],
        ["Geographic scope", currentRole.geo_scope],
        ["Largest deal", currentRole.largest_deal_band ? `${currentRole.largest_deal_band}${currentRole.largest_deal_currency ? ` ${currentRole.largest_deal_currency}` : ""}` : undefined],
        ["New logos", currentRole.new_logos_count],
        ["Renewal rate", currentRole.renewal_rate_band],
        ["Win rate", currentRole.win_rate_band],
      ].filter((f): f is [string, string] => Boolean(f[1]))
    : [];

  return (
    <div className="space-y-6">
      {/* --- Identity header --- */}
      <div className="rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Sales Passport</p>
            <h1 className="text-[19px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{fullName}</h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
              {currentJobTitle}
              {currentEmployer ? ` at ${currentEmployer}` : ""}
            </p>
            <p className="text-[12px] text-slate-400 mt-0.5">
              {currentLocation ?? "—"} · {totalExperienceYears ?? "—"} yrs experience
            </p>
          </div>
          {viewer === "recruiter" && recommendation && (
            <Badge tone={RECOMMENDATION_TONE[recommendation] ?? "neutral"}>{recommendation}</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
          <Stat label="Expected fixed CTC" value={expectedFixedCtc ? `₹${expectedFixedCtc}L` : undefined} />
          {viewer === "recruiter" && (
            <Stat label="Current fixed CTC" value={currentFixedCtc ? `₹${currentFixedCtc}L` : undefined} />
          )}
          <Stat label="Days to join" value={verifiedNotice ?? noticePeriod} />
          <Stat
            label={verifiedRelocation ? "Relocation — verified" : "Relocation — self-reported"}
            value={verifiedRelocation ?? openToRelocation}
          />
        </div>

        {(subDomain || (secondarySubDomains && secondarySubDomains.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-4">
            {subDomain && <Badge tone="accent">{subDomain}</Badge>}
            {secondarySubDomains?.map((s) => (
              <Badge key={s} tone="neutral" className="normal-case tracking-normal">
                {s}
              </Badge>
            ))}
          </div>
        )}

        {(currentIndustry || (industries && industries.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {currentIndustry && (
              <Badge tone="success" className="normal-case tracking-normal">
                {currentIndustry}
              </Badge>
            )}
            {industries
              ?.filter((i) => i !== currentIndustry)
              .map((i) => (
                <Badge key={i} tone="neutral" className="normal-case tracking-normal">
                  {i}
                </Badge>
              ))}
          </div>
        )}

        {skills && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => (
                <Badge key={s} tone="info" size="sm" className="normal-case tracking-normal">
                  {s}
                </Badge>
              ))}
          </div>
        )}
      </div>

      {/* --- Recruiter-only: assessment scores + recommendation --- */}
      {viewer === "recruiter" && ((scores && scores.length > 0) || (redFlags && redFlags.length > 0)) && (
        <div className="rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-1">Recruiter assessment</p>
          <p className="text-[11px] text-slate-400 mb-4">Internal only, never shown to clients.</p>
          {scores && scores.length > 0 && (
            <div className="flex items-center gap-6 mb-4">
              {scores.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {s.value}
                    <span className="text-[11px] font-normal text-slate-400">/5</span>
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {redFlags && redFlags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {redFlags.map((f) => (
                <Badge key={f} tone="danger" size="sm" className="normal-case tracking-normal">
                  {f}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- Sales identity (motion, persona, segment data) --- */}
      {segmentEntries.length > 0 && (
        <div className="rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-3">Sales identity</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {segmentEntries.map(([label, v]) => (
              <div key={label}>
                <p className="text-[11px] text-slate-400">{label}</p>
                <p className="text-[13px] text-slate-700 dark:text-slate-300">
                  {Array.isArray(v) ? v.join(", ") : String(v)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Current role: quarterly target vs achievement --- */}
      {hasQuarterlyGrid && currentRole && (
        <div className="rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Current role performance
            {currentRole.target_currency ? ` (${currentRole.target_currency})` : ""}
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            {(["q1", "q2", "q3", "q4"] as const).map((q) => {
              const target = currentRole[`target_${q}` as keyof ProfileTimelineEntry] as string | undefined;
              const achieved = currentRole[`achieved_${q}` as keyof ProfileTimelineEntry] as string | undefined;
              if (!target && !achieved) return null;
              return (
                <div key={q} className="rounded-ros-md bg-slate-50 dark:bg-slate-800/50 px-2 py-2.5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{q.toUpperCase()}</p>
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    {achieved || "—"}
                  </p>
                  <p className="text-[10px] text-slate-400">of {target || "—"} target</p>
                </div>
              );
            })}
          </div>
          {(currentRole.best_win || currentRole.tough_loss) && (
            <div className="grid sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              {currentRole.best_win && (
                <div>
                  <p className="text-[11px] font-medium text-emerald-600 uppercase tracking-wide mb-1">Best win</p>
                  <p className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{currentRole.best_win}</p>
                </div>
              )}
              {currentRole.tough_loss && (
                <div>
                  <p className="text-[11px] font-medium text-amber-600 uppercase tracking-wide mb-1">Tough loss</p>
                  <p className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{currentRole.tough_loss}</p>
                </div>
              )}
            </div>
          )}
          {revenueDetailFields.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              {revenueDetailFields.map(([label, value]) => (
                <div key={label}>
                  <p className="text-[11px] text-slate-400">{label}</p>
                  <p className="text-[13px] text-slate-700 dark:text-slate-300">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- Revenue Journey: full career timeline --- */}
      {timelineEntries.length > 0 && (
        <div className="rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Revenue Journey</p>
            {viewer === "recruiter" && stabilityLabel && (
              <Badge tone={stabilityLabel === "Stable" ? "success" : stabilityLabel === "Some Movement" ? "warning" : "danger"} size="sm">
                {stabilityLabel}
                {typeof stabilityScore === "number" ? ` · ${stabilityScore}` : ""}
              </Badge>
            )}
          </div>
          <Timeline entries={timelineEntries} />
          {viewer === "recruiter" && typeof domainConsistencyScore === "number" && (
            <p className="text-[11px] text-slate-400 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              Domain consistency score: <span className="font-medium text-slate-600 dark:text-slate-300">{domainConsistencyScore}/100</span>
            </p>
          )}
        </div>
      )}

      {timelineEntries.length === 0 && (
        <div className="rounded-ros-lg border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
          <p className="text-[13px] text-slate-400">No career timeline entries yet.</p>
        </div>
      )}
    </div>
  );
}
