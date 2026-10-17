import type { RoleCard } from "@/lib/role-card";

// Ranks everyone in the database against a role card, in three groups:
//   Perfect: does the job today, sells in the right world, and nothing important is off.
//   Close:   one thing is off, and it says which.
//   Stretch: more is off, but the fit is still worth a look.
// It scores from structured facts only (role cluster, level, selling profile, city, experience, pay, notice), so ranking
// the whole database is instant and every line can be explained.

export type MatchRow = {
  candidate_id: string;
  full_name: string | null;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | string | null;
  current_fixed_ctc: number | string | null;
  expected_fixed_ctc: number | string | null;
  notice_period: string | null;
  open_to_relocation: string | null;
  tags: { slug: string; seniority: string; metro: string | null; current: boolean }[];
  worlds: { slug: string; confidence: number }[];
  customer_types: string[];
  summary: string | null;
  deal_size: string | null;
  team_size: number | null;
  team_sells: string | null;
  motion: string | null;
  pool_tier: string | null;
  open_to_work_at?: string | null;
};

export type Ranked = {
  row: MatchRow;
  score: number;
  bucket: "perfect" | "close" | "stretch";
  matched: string[];
  gaps: string[];
  level: string;
  metro: string | null;
};

// How close one kind of job is to another (0 to 1). Only listed pairs count.
const NEAR: Record<string, Record<string, number>> = {
  account_exec: { bd_exec: 0.7, inside_sales: 0.5, field_sales: 0.5, account_mgmt: 0.4 },
  bd_exec: { account_exec: 0.7, inside_sales: 0.5, sdr_bdr: 0.4, field_sales: 0.5, channel_partner: 0.4 },
  sdr_bdr: { inside_sales: 0.5, bd_exec: 0.5 },
  inside_sales: { sdr_bdr: 0.5, account_exec: 0.5, bd_exec: 0.5 },
  field_sales: { account_exec: 0.5, bd_exec: 0.5 },
  solution_eng: { account_exec: 0.2 },
  customer_success: { account_mgmt: 0.7 },
  account_mgmt: { customer_success: 0.6, account_exec: 0.5 },
  channel_partner: { bd_exec: 0.4 },
  sales_leadership: { sales_manager: 0.6 },
  sales_manager: { sales_leadership: 0.6, account_exec: 0.4 },
};

/** Clusters worth fetching for a role: the wanted one and everything near it. */
export function clustersFor(card: RoleCard, also: string[] = []): string[] {
  const main = [card.cluster, ...also];
  return Array.from(new Set([...main, ...main.flatMap((c) => Object.keys(NEAR[c] ?? {}))]));
}

const LEVEL_ORDER = ["ic", "team_lead", "manager", "director", "vp_plus"];
const LEVEL_NAME: Record<string, string> = { ic: "individual contributor", team_lead: "team lead", manager: "manager", director: "director", vp_plus: "VP or above", unclear: "level not clear" };

function noticeDays(t: string | null): number | null {
  if (!t) return null;
  const s = t.toLowerCase();
  if (/immediate/.test(s)) return 0;
  const n = s.match(/(\d+)/);
  if (!n) return null;
  const v = Number(n[1]);
  return /month/.test(s) ? v * 30 : v;
}

export function rankCandidates(card: RoleCard, rows: MatchRow[], edges: Map<string, Map<string, number>>, name: (slug: string) => string, opts: { keepAll?: boolean; also?: string[] } = {}): Ranked[] {
  const exact = new Set(card.exact_worlds);
  // The main role type, plus any the mandate also accepts as a full fit.
  const wanted = new Set([card.cluster, ...(opts.also ?? [])]);
  const adjacent = new Map(card.adjacent_worlds.map((a) => [a.slug, 0.6]));
  const out: Ranked[] = [];

  for (const row of rows) {
    const matched: string[] = [];
    const gaps: string[] = [];
    let score = 0;

    // 1. What they do.
    const cur = row.tags.filter((t) => t.current);
    const exactNow = cur.find((t) => wanted.has(t.slug));
    const exactPast = row.tags.find((t) => wanted.has(t.slug) && !t.current);
    let fn: "exact" | "near" | "past" | "none" = "none";
    let levelTag = exactNow ?? exactPast ?? null;
    if (exactNow) {
      score += 30;
      fn = "exact";
      matched.push(`Does this job today${row.current_job_title ? ` (${row.current_job_title})` : ""}`);
    } else {
      let best = 0;
      for (const t of cur) {
        const w = NEAR[card.cluster]?.[t.slug] ?? 0;
        if (w > best) {
          best = w;
          levelTag = t;
        }
      }
      if (best > 0) {
        score += Math.round(best * 30);
        fn = "near";
        gaps.push(`Role is close but not the same (${row.current_job_title ?? "current role"})`);
      } else if (exactPast) {
        score += 10;
        fn = "past";
        gaps.push("Did this job before, not now");
      }
    }

    // 2. Level.
    const level = levelTag?.seniority ?? "unclear";
    if (card.level !== "any") {
      if (level === "unclear") {
        score += 4;
        gaps.push("Level not clear");
      } else {
        const d = Math.abs(LEVEL_ORDER.indexOf(level) - LEVEL_ORDER.indexOf(card.level));
        if (d === 0) {
          score += 15;
          matched.push(`Right level (${LEVEL_NAME[level]})`);
        } else if (d === 1) {
          score += 7;
          gaps.push(`A step ${LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(card.level) ? "above" : "below"}: ${LEVEL_NAME[level]}`);
        } else {
          score -= 10;
          gaps.push(`Level differs: ${LEVEL_NAME[level]}`);
        }
      }
    }

    // 3. What they sell.
    let worldFit: "exact" | "adjacent" | "unknown" | "none" = "none";
    if (row.worlds.length > 0 && (exact.size > 0 || adjacent.size > 0)) {
      const primary = row.worlds[0]?.slug;
      let best = 0;
      let bestSlug = "";
      let kind: "exact" | "adjacent" = "adjacent";
      for (const w of row.worlds) {
        if (exact.has(w.slug)) {
          const v = w.slug === primary ? 30 : 20;
          if (v > best || kind !== "exact") {
            best = v;
            bestSlug = w.slug;
            kind = "exact";
          }
        } else if (kind !== "exact") {
          let v = (adjacent.get(w.slug) ?? 0) * 20;
          for (const ex of exact) v = Math.max(v, (edges.get(ex)?.get(w.slug) ?? 0) * 20);
          if (v > best) {
            best = v;
            bestSlug = w.slug;
          }
        }
      }
      if (best > 0) {
        score += Math.round(best);
        worldFit = kind === "exact" ? "exact" : "adjacent";
        if (worldFit === "exact") matched.push(`Sells in ${name(bestSlug)}`);
        else gaps.push(`Sells in a nearby world (${name(bestSlug)})`);
      } else gaps.push("What they sell is not close");
    } else if (row.worlds.length === 0) {
      worldFit = "unknown";
      gaps.push("What they sell is not known yet");
    }
    if (row.summary) matched.push(row.summary);
    if (row.team_sells) matched.push(`Their team sells: ${row.team_sells}`);

    // 4. Customers.
    if (card.customer_types.length > 0 && row.customer_types.some((c) => card.customer_types.includes(c))) {
      score += 8;
      matched.push(`Sells to ${row.customer_types.filter((c) => card.customer_types.includes(c)).join(", ")}`);
    }

    // 5. City.
    const metro = cur[0]?.metro ?? row.tags[0]?.metro ?? null;
    if (card.cities.length > 0) {
      if (metro && card.cities.includes(metro)) {
        score += 10;
        matched.push(`Based in ${metro}`);
      } else if (metro === "Abroad") {
        score -= 20;
        gaps.push("Based abroad");
      } else if (row.open_to_relocation === "Yes") {
        score += 6;
        matched.push(`Open to relocate${metro ? ` (now ${metro})` : ""}`);
      } else if (row.open_to_relocation === "Maybe" || row.open_to_relocation === "Depends upon Option") {
        score += 3;
        gaps.push(`In ${metro ?? "another city"}, might relocate`);
      } else gaps.push(`In ${metro ?? "another city"}, not ${card.cities.join(" / ")}`);
    }

    // 6. Experience.
    const exp = row.total_experience_years != null ? Number(row.total_experience_years) : null;
    if (exp != null && (card.exp_min != null || card.exp_max != null)) {
      const lo = card.exp_min ?? 0;
      const hi = card.exp_max ?? 99;
      if (exp >= lo && exp <= hi) {
        score += 8;
        matched.push(`${exp} years, within range`);
      } else if (exp >= lo - 2 && exp <= hi + 2) score += 3;
      else {
        score -= 8;
        gaps.push(`${exp} years, role wants ${lo}-${hi === 99 ? "+" : hi}`);
      }
    }

    // 7. Pay and notice.
    const pay = row.expected_fixed_ctc != null ? Number(row.expected_fixed_ctc) : row.current_fixed_ctc != null ? Number(row.current_fixed_ctc) : null;
    if (card.budget_max != null && pay != null) {
      if (pay <= card.budget_max) score += 6;
      else if (pay > card.budget_max * 1.2) {
        score -= 8;
        gaps.push(`Expects ${pay} LPA, budget ${card.budget_max}`);
      } else gaps.push(`Expects ${pay} LPA, slightly above budget ${card.budget_max}`);
    }
    const nd = noticeDays(row.notice_period);
    if (nd != null && nd <= 30) {
      score += 4;
      matched.push(nd === 0 ? "Can join immediately" : `Notice ${nd} days`);
    } else if (nd != null && nd <= 60) score += 2;

    // Said, within three months, that they would like to hear about roles.
    if (row.open_to_work_at && new Date().getTime() - new Date(row.open_to_work_at).getTime() < 90 * 86_400_000) {
      score += 5;
      matched.push("Told us they're open to new roles");
    }

    // 8. Verified by a recruiter.
    if (row.pool_tier === "top") score += 8;
    else if (row.pool_tier === "strong") score += 5;
    else if (row.pool_tier === "watch") score += 2;

    const hard = gaps.filter((g) => !/not known yet|Level not clear/.test(g));
    let bucket: Ranked["bucket"];
    if (fn === "exact" && worldFit === "exact" && hard.length === 0) bucket = "perfect";
    else if (hard.length <= 1 && fn !== "none" && worldFit !== "none") bucket = "close";
    else bucket = "stretch";
    // Search results hide weak matches; people who already applied are always scored, however low.
    if (score < 35 && bucket === "stretch" && !opts.keepAll) continue;
    out.push({ row, score, bucket, matched, gaps, level, metro });
  }
  return out.sort((a, b) => b.score - a.score);
}
