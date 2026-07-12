import {
  roleTypeOptions,
  teamSizeOptions,
  dealSizeBandsFor,
  salesCycleOptions,
  sellingStyleOptions,
  customerSegmentOptions,
  workModeOptions,
  relocationOptions,
  type CurrencyValue,
} from "./candidate-options";

// A single screening question, whichever tier it belongs to. Tier 1 =
// profile-gap-fill (this candidate is missing a structured field that any
// future mandate would also want -- e.g. deal-size band, sales-cycle
// comfort). Tier 2 = mandate-specific, from the AI-generated bank on the
// mandate row. Both render through the same control set (dropdown /
// multi-select / free-text) so the panel doesn't need two UIs.
export type MandateScreeningQuestion = {
  id: string;
  text: string;
  tier: 1 | 2;
  answer_type: "dropdown" | "multi_select" | "free_text";
  options: string[];
  // Dot-path into either a flat candidate column ("work_mode") or a
  // segment_data key ("segment_data.cycle"). Present only for Tier 1
  // questions with a direct, unambiguous field to write back to -- Tier 2
  // questions from the AI bank never carry this, since they're mandate
  // framing, not a reusable profile fact.
  maps_to_field: string | null;
  source: "gap_fill" | "ai" | "recruiter";
};

type CandidateForGaps = {
  category: string | null;
  work_mode: string | null;
  open_to_relocation: string | null;
  notice_period: string | null;
  segment_data: Record<string, unknown> | null;
};

function segStr(data: Record<string, unknown> | null | undefined, key: string): string {
  const v = data?.[key];
  return typeof v === "string" ? v : "";
}

/**
 * Computes the Tier 1 profile-gap-fill questions for one candidate, in the
 * context of one mandate. Only fields that are (a) actually missing on this
 * candidate and (b) relevant to their sales category are asked -- e.g. a
 * Non-Sales candidate never gets a deal-size-band question. Every question
 * here maps to a real structured field so an answer writes straight into
 * the candidate's profile, not just a note -- no free-text normalization
 * needed later.
 */
export function computeTier1GapQuestions(
  candidate: CandidateForGaps,
  mandateCurrency: CurrencyValue
): MandateScreeningQuestion[] {
  const questions: MandateScreeningQuestion[] = [];
  const sd = candidate.segment_data ?? null;
  const isSales = candidate.category === "b2b_sales" || candidate.category === "b2c_sales";

  if (!candidate.work_mode) {
    questions.push({
      id: "gap_work_mode",
      text: "What work arrangement is this candidate open to?",
      tier: 1,
      answer_type: "dropdown",
      options: [...workModeOptions],
      maps_to_field: "work_mode",
      source: "gap_fill",
    });
  }

  if (!candidate.open_to_relocation) {
    questions.push({
      id: "gap_relocation",
      text: "Is this candidate open to relocation?",
      tier: 1,
      answer_type: "dropdown",
      options: [...relocationOptions],
      maps_to_field: "open_to_relocation",
      source: "gap_fill",
    });
  }

  if (isSales) {
    const roleType = segStr(sd, "role_type");
    if (!roleType) {
      questions.push({
        id: "gap_role_type",
        text: "Is this candidate an individual contributor or leading a team?",
        tier: 1,
        answer_type: "dropdown",
        options: [...roleTypeOptions],
        maps_to_field: "segment_data.role_type",
        source: "gap_fill",
      });
    } else if (roleType === "Team Lead" && !segStr(sd, "team_size")) {
      // Only ask team size once we already know they lead a team --
      // asking it before role_type is known would be a leading question.
      questions.push({
        id: "gap_team_size",
        text: "How large a team has this candidate directly managed?",
        tier: 1,
        answer_type: "dropdown",
        options: [...teamSizeOptions],
        maps_to_field: "segment_data.team_size",
        source: "gap_fill",
      });
    }

    if (!segStr(sd, "cycle")) {
      questions.push({
        id: "gap_sales_cycle",
        text: "What sales-cycle length is this candidate most comfortable with?",
        tier: 1,
        answer_type: "dropdown",
        options: [...salesCycleOptions],
        maps_to_field: "segment_data.cycle",
        source: "gap_fill",
      });
    }

    if (!segStr(sd, "style")) {
      questions.push({
        id: "gap_selling_style",
        text: "Would you describe this candidate as a Hunter, Farmer, or Hybrid?",
        tier: 1,
        answer_type: "dropdown",
        options: [...sellingStyleOptions],
        maps_to_field: "segment_data.style",
        source: "gap_fill",
      });
    }

    if (!segStr(sd, "segment")) {
      questions.push({
        id: "gap_customer_segment",
        text: "What customer segment has this candidate primarily sold into?",
        tier: 1,
        answer_type: "dropdown",
        options: [...customerSegmentOptions],
        maps_to_field: "segment_data.segment",
        source: "gap_fill",
      });
    }

    const dealKey = candidate.category === "b2c_sales" ? "ticket" : "deal_size";
    if (!segStr(sd, dealKey)) {
      questions.push({
        id: "gap_deal_size",
        text: "What deal-size band has this candidate typically closed?",
        tier: 1,
        answer_type: "dropdown",
        options: dealSizeBandsFor(candidate.category, mandateCurrency),
        maps_to_field: `segment_data.${dealKey}`,
        source: "gap_fill",
      });
    }
  }

  return questions;
}

/**
 * Applies a set of answered Tier 1 questions directly onto a candidate
 * update payload -- flat columns get set directly, segment_data.* keys get
 * merged into the existing segment_data blob (mirroring the exact merge
 * pattern EditProfileButton already uses, so nothing downstream that reads
 * segment_data needs to change).
 */
export function buildCandidateUpdateFromTier1Answers(
  existingSegmentData: Record<string, unknown> | null,
  answers: { maps_to_field: string | null; answer: unknown }[]
): { flat: Record<string, unknown>; segmentData: Record<string, unknown> } {
  const flat: Record<string, unknown> = {};
  const segmentData: Record<string, unknown> = { ...(existingSegmentData ?? {}) };

  for (const { maps_to_field, answer } of answers) {
    if (!maps_to_field || answer == null || answer === "") continue;
    if (maps_to_field.startsWith("segment_data.")) {
      const key = maps_to_field.slice("segment_data.".length);
      segmentData[key] = answer;
    } else {
      flat[maps_to_field] = answer;
    }
  }

  return { flat, segmentData };
}
