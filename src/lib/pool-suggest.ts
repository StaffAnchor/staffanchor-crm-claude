import type { PassportRow } from "@/lib/saas-passport";

// Who is most worth a call: bench people who look like pool material on paper but nobody has spoken to yet. A
// plain scoring rule, no AI, so it is instant and can be explained line by line. It decides where recruiter time
// goes first; the call decides whether they belong. It weighs, in this order of importance: whether they fit a
// role that is open today, what they have sold, how long they stay in jobs, and whether they have worked at
// companies the owner rates.

export type Tenure = { avg: number | null; short: number; companies: string[] };
export type RoleFitHint = { boost: number; reasons: string[] };

export type SuggestContext = {
  tenure: Map<string, Tenure>;
  /** Company names the owner rates, lower case. */
  targets: string[];
  roleFit: Map<string, RoleFitHint>;
};

export type Suggestion = { row: PassportRow; score: number; reasons: string[]; cautions: string[] };

export function suggestionFor(r: PassportRow, ctx?: SuggestContext): { score: number; reasons: string[]; cautions: string[] } {
  if (!r.has_cv) return { score: 0, reasons: [], cautions: [] };
  let score = 0;
  const reasons: string[] = [];
  const cautions: string[] = [];

  // 1. A role is open today and this person fits it.
  const hint = ctx?.roleFit.get(r.candidate_id);
  if (hint) {
    score += hint.boost;
    reasons.push(...hint.reasons);
  }

  // 2. What they have sold.
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

  // 3. Stability: how long they stay in a job, from the CV's own dates.
  const t = ctx?.tenure.get(r.candidate_id);
  if (t?.avg != null) {
    if (t.avg >= 3) {
      score += 12;
      reasons.push(`Stays about ${t.avg.toFixed(1)} years a job`);
    } else if (t.avg >= 2.5) {
      score += 8;
      reasons.push(`Stays about ${t.avg.toFixed(1)} years a job`);
    } else if (t.avg >= 2) score += 4;
  }
  if (t && t.short >= 2) {
    score -= 12;
    cautions.push(`${t.short} jobs under a year`);
  } else if (t && t.short === 1) score -= 3;

  // 4. Companies the owner rates.
  if (ctx && ctx.targets.length > 0) {
    const hit = (t?.companies ?? []).find((c) => ctx.targets.some((x) => x && c.toLowerCase().includes(x)));
    const current = (r.current_employer ?? "").toLowerCase();
    if (hit) {
      score += 15;
      reasons.push(`Has worked at ${hit}`);
    } else if (current && ctx.targets.some((x) => x && current.includes(x))) {
      score += 15;
      reasons.push(`At ${r.current_employer}`);
    }
  }

  score += Math.round((r.passport_score ?? 0) / 10);
  if (r.readiness_tier === "ready") score += 6;
  if (r.notice_days_est != null && r.notice_days_est <= 30) {
    score += 4;
    reasons.push("Can join within 30 days");
  }
  if (r.confirmed_by_profile) score += 4;
  return { score, reasons: reasons.slice(0, 6), cautions };
}

/** The best few to call next: not already in the pool and not already spoken to. */
export function suggestToCall(rows: PassportRow[], exclude: Set<string>, ctx: SuggestContext | undefined, limit = 12): Suggestion[] {
  return rows
    .filter((r) => !exclude.has(r.candidate_id))
    .map((row) => ({ row, ...suggestionFor(row, ctx) }))
    .filter((s) => s.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
