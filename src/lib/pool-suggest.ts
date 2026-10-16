import type { PassportRow } from "@/lib/saas-passport";

// Who is most worth a call: bench people who look like pool material on paper (CV facts and passport) but nobody
// has spoken to yet. A plain scoring rule, no AI, so it is instant and can be explained line by line. It decides
// where recruiter time goes first; the call decides whether they belong.

export type Suggestion = { row: PassportRow; score: number; reasons: string[] };

export function suggestionFor(r: PassportRow): { score: number; reasons: string[] } {
  if (!r.has_cv) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  if (r.practice_fit === "saas") {
    score += 25;
    reasons.push("Sells SaaS");
  } else if (r.practice_fit === "tech") {
    score += 12;
    reasons.push("Sells tech");
  }
  const exp = Number(r.total_experience_years ?? 0);
  if (exp >= 4 && exp <= 15) {
    score += 15;
    reasons.push(`${exp} years in`);
  } else if (exp > 0 && exp < 2) score -= 15;
  const segs = r.segments ?? [];
  if (segs.includes("enterprise")) {
    score += 15;
    reasons.push("Enterprise accounts");
  } else if (segs.includes("mid-market")) {
    score += 10;
    reasons.push("Mid-market accounts");
  }
  if (r.quota) {
    score += 12;
    reasons.push(`Quota: ${r.quota}`);
  }
  if (r.best_achievement) {
    score += 10;
    reasons.push("States a concrete result");
  }
  if (r.deal_size) {
    score += 8;
    reasons.push(`Deals ${r.deal_size}`);
  }
  if (r.hunter_farmer === "hunter" || r.hunter_farmer === "both") score += 5;
  score += Math.round((r.passport_score ?? 0) / 10);
  if (r.readiness_tier === "ready") score += 6;
  if (r.notice_days_est != null && r.notice_days_est <= 30) {
    score += 4;
    reasons.push("Can join within 30 days");
  }
  if (r.confirmed_by_profile) score += 4;
  return { score, reasons: reasons.slice(0, 5) };
}

/** The best few to call next: not already in the pool and not already spoken to. */
export function suggestToCall(rows: PassportRow[], exclude: Set<string>, limit = 12): Suggestion[] {
  return rows
    .filter((r) => !exclude.has(r.candidate_id))
    .map((row) => ({ row, ...suggestionFor(row) }))
    .filter((s) => s.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
