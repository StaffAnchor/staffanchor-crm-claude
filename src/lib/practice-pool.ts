// Shared matching logic for the Practice Pool feature -- cross-referencing
// a candidate's practice+seniority-band tag(s) against open mandates in
// that same practice. Used by both the standalone /practice-pool page
// (pool-wide view) and the per-candidate "Practice Matches" panel on the
// candidate detail page (single-candidate slice of the same logic), so the
// two surfaces never drift apart on what counts as a match.

export const SENIORITY_LABEL: Record<string, string> = {
  ic: "IC",
  team_lead: "Team Lead",
  manager: "Manager",
  director: "Director",
  vp_plus: "VP & above",
};

export const SENIORITY_ORDER = ["ic", "team_lead", "manager", "director", "vp_plus"] as const;

export type PracticeMandate = {
  id: string;
  role_title: string;
  client_name: string;
  practice_id: string;
  seniority_band: string | null;
};

// "Exact" = same seniority band, or a mandate with no band set at all
// (treated as open to any level, same convention the original Practice
// Pool page used). "Near" = one band above or below -- e.g. a Team Lead
// candidate against a Manager-band mandate. Still worth a recruiter's
// attention, but shown separately and dimmer so it never gets mistaken for
// a confirmed-band fit.
//
// Mandates the candidate already has a candidate_mandate_links row against
// (any stage -- including rejected) are excluded from both lists: that
// pairing has already been actioned, so resurfacing it as a "new
// opportunity" every time this view loads would just be noise the
// recruiter has to re-triage.
export function matchMandatesForPractice(
  mandates: PracticeMandate[],
  practiceId: string,
  seniorityBand: string,
  alreadyLinkedMandateIds: Set<string>
): { exact: PracticeMandate[]; near: PracticeMandate[] } {
  const bandIdx = SENIORITY_ORDER.indexOf(seniorityBand as (typeof SENIORITY_ORDER)[number]);
  const inPractice = mandates.filter((m) => m.practice_id === practiceId && !alreadyLinkedMandateIds.has(m.id));

  const exact: PracticeMandate[] = [];
  const near: PracticeMandate[] = [];

  for (const m of inPractice) {
    if (!m.seniority_band || m.seniority_band === seniorityBand) {
      exact.push(m);
      continue;
    }
    const mIdx = SENIORITY_ORDER.indexOf(m.seniority_band as (typeof SENIORITY_ORDER)[number]);
    if (bandIdx !== -1 && mIdx !== -1 && Math.abs(mIdx - bandIdx) === 1) {
      near.push(m);
    }
  }

  return { exact, near };
}
