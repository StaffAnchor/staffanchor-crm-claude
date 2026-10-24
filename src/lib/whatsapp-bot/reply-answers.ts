import { parseCtcLakhs, parseEmail, parseExperienceYears, parseNoticePeriod } from "./parse";
import type { Answers } from "./flow";

// Reads answers out of a free-form reply, so someone who already said "30 days, 22 lpa" is not asked it all again.
// It only fills what we do not already know, and only when it is clear which question a figure answers: a notice period
// is recognised by its unit, and a pay figure goes to current or expected only when they say which, or when only one of
// the two is still missing. If it is not clear, it leaves the question for the assistant to ask.

const SPLIT = /\n+|;|,(?!\d)|\s+and\s+|\s*\|\s*/i;
const NOTICE_WORDS = /\b(days?|weeks?|months?|immediate(?:ly)?|asap|notice|serving|available now|can join)\b/i;
const MONEY_WORDS = /(?:₹|\b(?:lpa|lakhs?|lacs?|ctc|cr|crores?|per annum|p\.?a\.?|k)\b)/i;
const EXPECTED = /\b(expect(?:ed|ing|ation)?|desired|want|looking for|target|hoping)\b/i;
const CURRENT = /\b(current(?:ly)?|present|drawing|now|getting|fixed|take.?home)\b/i;
const EXPERIENCE = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i;

export function answersFromReply(raw: string | null | undefined, known: Answers): Answers {
  const text = (raw ?? "").trim();
  const out: Answers = {};
  if (!text || text.length > 400) return out;
  const segs = text.split(SPLIT).map((s) => s.trim()).filter(Boolean);
  const unlabelled: number[] = [];

  for (const seg of segs) {
    if (known.notice_period === undefined && out.notice_period === undefined && NOTICE_WORDS.test(seg)) {
      const n = parseNoticePeriod(seg);
      if (n) {
        out.notice_period = n;
        continue;
      }
    }
    if (MONEY_WORDS.test(seg) && !NOTICE_WORDS.test(seg)) {
      const v = parseCtcLakhs(seg);
      if (v !== null) {
        if (EXPECTED.test(seg) && !CURRENT.test(seg)) {
          if (known.expected_fixed_ctc === undefined && out.expected_fixed_ctc === undefined) out.expected_fixed_ctc = v;
        } else if (CURRENT.test(seg) && !EXPECTED.test(seg)) {
          if (known.current_fixed_ctc === undefined && out.current_fixed_ctc === undefined) out.current_fixed_ctc = v;
        } else unlabelled.push(v);
        continue;
      }
    }
    if (known.total_experience_years === undefined && out.total_experience_years === undefined && EXPERIENCE.test(seg) && !NOTICE_WORDS.test(seg.replace(EXPERIENCE, ""))) {
      const y = parseExperienceYears(seg);
      if (y !== null) {
        out.total_experience_years = y;
        continue;
      }
    }
    if (known.email === undefined && out.email === undefined) {
      const e = parseEmail(seg);
      if (e) out.email = e;
    }
  }

  // Unlabelled pay figures: only when exactly one of current / expected is still missing, and there is exactly one figure.
  const needCurrent = known.current_fixed_ctc === undefined && out.current_fixed_ctc === undefined;
  const needExpected = known.expected_fixed_ctc === undefined && out.expected_fixed_ctc === undefined;
  if (unlabelled.length === 1 && needCurrent !== needExpected) {
    if (needExpected) out.expected_fixed_ctc = unlabelled[0];
    else out.current_fixed_ctc = unlabelled[0];
  }
  return out;
}
