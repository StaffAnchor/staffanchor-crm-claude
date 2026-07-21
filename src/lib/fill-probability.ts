// Deterministic (non-AI) fill-probability heuristic for the mandate
// cockpit's health strip. Deliberately not another Gemini call -- this
// needs to be instant, free, and auditable to a recruiter ("why is this
// 35%?"), which a hand-rolled weighted score gives you and an opaque LLM
// score doesn't. Was explicitly deferred out of the original cockpit
// rebuild pending more usage data; the health-signal/blocker fields it's
// built from (days open, pipeline depth, submissions, screening,
// stale-feedback, AI match quality) have now been live long enough to
// calibrate weights against.

export type FillProbability = {
  score: number; // 0-100, clamped
  bucket: "high" | "medium" | "low";
  driver: string; // the single biggest factor behind the score, for a one-line "why"
};

type Factor = { label: string; delta: number };

export function computeFillProbability(input: {
  daysOpen: number;
  staffCount: number;
  pipelineCount: number;
  submittedCount: number;
  screenedCount: number;
  staleFeedbackCount: number;
  topMatchScore: number | null; // best cached AI match score (0-100), if any
}): FillProbability {
  const {
    daysOpen,
    staffCount,
    pipelineCount,
    submittedCount,
    screenedCount,
    staleFeedbackCount,
    topMatchScore,
  } = input;

  const factors: Factor[] = [];

  if (staffCount === 0) {
    factors.push({ label: "No recruiter/vendor staffed", delta: -25 });
  } else {
    factors.push({ label: "Recruiter/vendor staffed", delta: 8 });
  }

  if (pipelineCount === 0) {
    factors.push({
      label: "No candidates sourced yet",
      delta: daysOpen >= 3 ? -15 : -5,
    });
  } else {
    factors.push({
      label: `${pipelineCount} candidate${pipelineCount === 1 ? "" : "s"} in pipeline`,
      delta: Math.min(pipelineCount, 10) * 2,
    });
  }

  if (submittedCount === 0) {
    if (daysOpen >= 21) {
      factors.push({ label: "Aging with zero submissions", delta: -15 });
    }
  } else {
    factors.push({
      label: `${submittedCount} submitted to client`,
      delta: Math.min(submittedCount, 5) * 4,
    });
  }

  if (screenedCount > 0) {
    factors.push({ label: `${screenedCount} candidates screened`, delta: 5 });
  }

  if (topMatchScore != null) {
    if (topMatchScore >= 75) {
      factors.push({ label: `Strong AI match found (${topMatchScore})`, delta: Math.round((topMatchScore - 60) / 4) });
    } else if (topMatchScore < 40) {
      factors.push({ label: `Weak AI-matched pool (best ${topMatchScore})`, delta: Math.round((topMatchScore - 60) / 4) });
    }
  }

  if (staleFeedbackCount > 0) {
    factors.push({
      label: `${staleFeedbackCount} awaiting client feedback 4+ days`,
      delta: Math.max(-24, -8 * staleFeedbackCount),
    });
  }

  const raw = 50 + factors.reduce((sum, f) => sum + f.delta, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const bucket: FillProbability["bucket"] = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  const driver =
    factors.length > 0
      ? factors.reduce((biggest, f) => (Math.abs(f.delta) > Math.abs(biggest.delta) ? f : biggest)).label
      : "Not enough activity yet to score";

  return { score, bucket, driver };
}
