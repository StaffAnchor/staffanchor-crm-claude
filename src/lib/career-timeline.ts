// Career Timeline -- two parallel sources of a candidate's job history,
// merged for scoring, diffed for gaps. See migration
// candidate_career_timeline for the columns this reads/writes.
//
// - ProfileTimelineEntry: structured, dropdown-driven, confirmed by a
//   recruiter or the candidate. Trusted first for scoring and matching.
// - ResumeTimelineEntry: AI-extracted from resume_text, regenerated
//   automatically whenever the resume changes. Exists even for a candidate
//   who never opens the profile builder -- this is what makes Stability
//   Score possible for someone who only ever uploaded a resume.

export type ProfileTimelineEntry = {
  id: string;
  company: string;
  title: string;
  category: "b2b_sales" | "b2c_sales" | "non_sales" | "";
  sub_domain: string;
  industry: string;
  customer_segment: string;
  deal_size_band: string;
  sales_cycle: string;
  selling_style: string;
  team_size: string;
  start_month: string; // "YYYY-MM"
  end_month: string | null; // null = current role
  // ---- Revenue impact (Sales Passport "Revenue Journey" cards) -- all
  // optional, additive, purely descriptive/display fields the candidate or
  // recruiter can fill in per role. Bands rather than raw numbers where an
  // existing taxonomy applies, so these stay comparable across candidates
  // instead of free text. Never used in stability/domain scoring.
  revenue_generated?: string; // free text, e.g. "₹82 Cr" -- candidate's own claim, display-only
  quota_attainment_band?: string; // reuses achievementBandOptions
  largest_deal_band?: string; // reuses dealSizeBandsFor(category, currency)
  largest_deal_currency?: string;
  new_logos_count?: string;
  renewal_rate_band?: string; // reuses renewalRateBandOptions
  win_rate_band?: string; // reuses winRateBandOptions
  reporting_to?: string; // free text role title, e.g. "VP Sales"
  client_tier?: string; // reuses customerSegmentOptions
  geo_scope?: string; // reuses geographicScopeOptions
  // ---- Sales Passport per-experience detail -- mirrors jobs-staffanchor-clean's
  // src/lib/career-timeline.ts exactly so both apps read/write identical values
  // in the shared career_timeline_profile column. All optional/additive.
  sales_motion?: string;
  decision_maker_persona?: string; // B2B: who was actually sold to (CFO/CTO/etc.)
  customer_type?: string; // B2C: end-consumer persona (HNI/Students/etc.)
  // ---- Industrial & Infrastructure practice-specific fields -- only
  // meaningful/rendered when sub_domain for this entry is
  // "Industrial & Infrastructure".
  territory_region?: string;
  commercial_route?: string;
  target_account_type?: string;
  product_complexity?: string;
  // ---- Inside Sales specific fields
  aht?: string;
  daily_call_target?: string;
  daily_talk_time?: string;
  lead_source?: string;
  reason_for_leaving?: string;
  avg_quarterly_target_band?: string; // used for roles other than the current one
  avg_quarterly_revenue_value?: string;
  avg_quarterly_revenue_currency?: string;
  // ---- Current-role-only performance detail: quarterly target/achievement
  // grid, only ever filled/shown for the entry where end_month === null.
  target_currency?: string;
  target_q1?: string;
  target_q2?: string;
  target_q3?: string;
  target_q4?: string;
  achieved_q1?: string;
  achieved_q2?: string;
  achieved_q3?: string;
  achieved_q4?: string;
  has_ic_target_too?: string; // "Yes"/"No" -- for a Team Lead role, do they also carry an individual number
  ic_target_currency?: string;
  ic_target_q1?: string;
  ic_target_q2?: string;
  ic_target_q3?: string;
  ic_target_q4?: string;
  ic_achieved_q1?: string;
  ic_achieved_q2?: string;
  ic_achieved_q3?: string;
  ic_achieved_q4?: string;
  best_win?: string;
  tough_loss?: string;
};

export type ResumeTimelineEntry = {
  id: string;
  company: string;
  title: string;
  start_month: string | null;
  end_month: string | null; // null = current, per the resume text
  description: string;
};

export type MergedTimelineEntry = {
  company: string;
  title: string;
  start_month: string | null;
  end_month: string | null;
  source: "profile" | "resume";
  category?: string;
  sub_domain?: string;
  tenureMonths: number;
};

export type CareerGap =
  | { type: "resume_not_in_profile"; resumeEntry: ResumeTimelineEntry; message: string }
  | { type: "profile_not_in_resume"; profileEntry: ProfileTimelineEntry; message: string }
  | { type: "mismatch"; company: string; profileEntry: ProfileTimelineEntry; resumeEntry: ResumeTimelineEntry; message: string }
  | { type: "current_employer_mismatch"; currentEmployer: string; resumeCompany: string; message: string };

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt\.?|private|ltd\.?|limited|inc\.?|incorporated|llc|llp|corp\.?|corporation)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function sameCompany(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function monthsBetween(start: string | null, end: string | null): number {
  if (!start) return 0;
  const [sy, sm] = start.split("-").map(Number);
  const now = new Date();
  const [ey, em] = end ? end.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  if (!sy || !sm) return 0;
  return Math.max(0, (ey - sy) * 12 + (em - sm));
}

/**
 * Builds the effective timeline used for scoring: one entry per job, profile
 * version preferred whenever a resume entry matches it by company, plus any
 * profile-only or resume-only entries that don't have a counterpart.
 */
export function mergeTimelines(
  profileEntries: ProfileTimelineEntry[],
  resumeEntries: ResumeTimelineEntry[]
): MergedTimelineEntry[] {
  const merged: MergedTimelineEntry[] = [];
  const usedResumeIds = new Set<string>();

  for (const p of profileEntries) {
    const match = resumeEntries.find((r) => !usedResumeIds.has(r.id) && sameCompany(r.company, p.company));
    if (match) usedResumeIds.add(match.id);
    merged.push({
      company: p.company,
      title: p.title,
      start_month: p.start_month,
      end_month: p.end_month,
      source: "profile",
      category: p.category || undefined,
      sub_domain: p.sub_domain || undefined,
      tenureMonths: monthsBetween(p.start_month, p.end_month),
    });
  }

  for (const r of resumeEntries) {
    if (usedResumeIds.has(r.id)) continue;
    merged.push({
      company: r.company,
      title: r.title,
      start_month: r.start_month,
      end_month: r.end_month,
      source: "resume",
      tenureMonths: monthsBetween(r.start_month, r.end_month),
    });
  }

  return merged;
}

export type StabilityResult = { score: number; label: "Stable" | "Some Movement" | "Frequent Job-Hopper" };

/**
 * Tenure-weighted stability, on a 0-100 meter plus the same three labels the
 * recruiter-assessment scorecard already uses for its manual "Job stability"
 * field -- this is an auto-computed complement to that judgment call, not a
 * replacement, so the two should read as consistent rather than competing
 * vocabularies.
 */
export function computeStabilityScore(merged: MergedTimelineEntry[]): StabilityResult | null {
  const withTenure = merged.filter((e) => e.tenureMonths > 0);
  if (withTenure.length === 0) return null;
  const avgMonths = withTenure.reduce((sum, e) => sum + e.tenureMonths, 0) / withTenure.length;
  const score = Math.round(Math.max(0, Math.min(100, (avgMonths / 42) * 100)));
  const label: StabilityResult["label"] = avgMonths >= 30 ? "Stable" : avgMonths >= 15 ? "Some Movement" : "Frequent Job-Hopper";
  return { score, label };
}

export type DomainConsistencyResult = { score: number; dominantDomain: string };

/**
 * Only draws from entries carrying a category/sub-domain tag -- i.e.
 * confirmed profile entries, or resume entries once someone tags them via
 * "Confirm & add to profile". Unconfirmed resume-only entries count toward
 * Stability but not toward this, since we don't actually know their domain.
 */
export function computeDomainConsistencyScore(profileEntries: ProfileTimelineEntry[]): DomainConsistencyResult | null {
  const tagged = profileEntries.filter((e) => e.category && e.sub_domain);
  if (tagged.length === 0) return null;
  const sorted = [...tagged].sort((a, b) => (a.start_month < b.start_month ? 1 : -1));
  const dominant = sorted[0];
  const matching = tagged.filter((e) => e.category === dominant.category && e.sub_domain === dominant.sub_domain);
  const score = Math.round((matching.length / tagged.length) * 100);
  return { score, dominantDomain: dominant.sub_domain };
}

/**
 * Diffs resume-extracted history against the confirmed profile timeline
 * (plus the flat current_employer field) so a recruiter has something
 * concrete to raise on a screening call, instead of the two silently
 * drifting apart. Closes the "no resume-vs-form consistency check" gap.
 */
export function computeCareerGaps(input: {
  profileEntries: ProfileTimelineEntry[];
  resumeEntries: ResumeTimelineEntry[];
  currentEmployer: string | null;
}): CareerGap[] {
  const gaps: CareerGap[] = [];
  const { profileEntries, resumeEntries, currentEmployer } = input;

  for (const r of resumeEntries) {
    const match = profileEntries.find((p) => sameCompany(p.company, r.company));
    if (!match) {
      gaps.push({
        type: "resume_not_in_profile",
        resumeEntry: r,
        message: `Resume mentions ${r.title || "a role"} at ${r.company}${r.start_month ? ` (${r.start_month}${r.end_month ? ` – ${r.end_month}` : " – present"})` : ""} -- not yet added to the structured profile.`,
      });
      continue;
    }
    const titleMismatch = match.title && r.title && normalizeCompany(match.title) !== normalizeCompany(r.title);
    const dateMismatch =
      r.start_month && match.start_month && r.start_month.slice(0, 4) !== match.start_month.slice(0, 4);
    if (titleMismatch || dateMismatch) {
      gaps.push({
        type: "mismatch",
        company: r.company,
        profileEntry: match,
        resumeEntry: r,
        message: `${r.company}: profile says "${match.title}"${match.start_month ? ` from ${match.start_month}` : ""}, resume says "${r.title}"${r.start_month ? ` from ${r.start_month}` : ""} -- worth confirming which is right.`,
      });
    }
  }

  for (const p of profileEntries) {
    const match = resumeEntries.find((r) => sameCompany(r.company, p.company));
    if (!match) {
      gaps.push({
        type: "profile_not_in_resume",
        profileEntry: p,
        message: `${p.title || "Role"} at ${p.company} is in the profile but the resume text doesn't mention it -- may be very recent, or the resume on file is outdated.`,
      });
    }
  }

  if (currentEmployer?.trim() && resumeEntries.length > 0) {
    const mostRecentResume = [...resumeEntries].sort((a, b) => ((a.start_month ?? "") < (b.start_month ?? "") ? 1 : -1))[0];
    if (mostRecentResume?.company && !sameCompany(mostRecentResume.company, currentEmployer)) {
      gaps.push({
        type: "current_employer_mismatch",
        currentEmployer,
        resumeCompany: mostRecentResume.company,
        message: `Current employer on file is "${currentEmployer}", but the most recent role on the resume is at "${mostRecentResume.company}" -- worth confirming which is current.`,
      });
    }
  }

  return gaps;
}
