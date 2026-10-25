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
  readiness_tier?: string | null;
  readiness_missing?: string[] | null;
  sub_group?: string | null;
  /** Latest communication rating from a call: good, okay or weak. */
  comm?: string | null;
  /** From candidate_top_tier: "top" once pay ratio, experience, communication and openness are all confirmed. */
  quality_tier?: string | null;
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

// Cities close enough that someone in one can reasonably take a job in the other.
const NEARBY: Record<string, string[]> = { "Mumbai (MMR)": ["Pune"], Pune: ["Mumbai (MMR)"] };

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

    // What a recruiter would accept without a second thought: about two years either way on experience, a couple of lakhs
    // (or 10%) on pay, a nearby city, someone open to move. A "near" is noted but costs little; a "miss" is a real gap.
    // Anything not known yet (pay, motion, relocation) is never a miss: it is a reason to call and ask.
    let misses = 0;
    let nears = 0;
    let borderline = 0;
    let payUnknown = false;
    if (fn === "near") nears++;
    else if (fn === "past") {
      misses++;
      borderline++;
    } else if (fn === "none") misses++;

    // 2. Level.
    const level = levelTag?.seniority ?? "unclear";
    if (card.level !== "any") {
      if (level === "unclear") {
        score += 4;
        gaps.push("Level not clear");
      } else {
        const d = Math.abs(LEVEL_ORDER.indexOf(level) - LEVEL_ORDER.indexOf(card.level));
        if (d === 0) {
          score += 12;
          matched.push(`Right level (${LEVEL_NAME[level]})`);
        } else if (d === 1) {
          score += 6;
          nears++;
          gaps.push(`A step ${LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(card.level) ? "above" : "below"}: ${LEVEL_NAME[level]}`);
        } else {
          score -= 8;
          misses++;
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
        else {
          nears++;
          gaps.push(`Sells in a nearby world (${name(bestSlug)})`);
        }
      } else {
        misses++;
        gaps.push("What they sell is not close");
      }
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

    // 5. City: the role's city first, then a nearby city, then someone who says they would move.
    const metro = cur[0]?.metro ?? row.tags[0]?.metro ?? null;
    if (card.cities.length > 0) {
      const near = metro ? card.cities.find((c) => NEARBY[metro]?.includes(c)) : undefined;
      if (metro && card.cities.includes(metro)) {
        score += 12;
        matched.push(`Based in ${metro}`);
      } else if (metro === "Abroad") {
        score -= 20;
        misses++;
        gaps.push("Based abroad");
      } else if (near) {
        score += 7;
        nears++;
        gaps.push(`Based in ${metro}, close to ${near}`);
      } else if (row.open_to_relocation === "Yes") {
        score += 6;
        nears++;
        matched.push(`Open to relocate${metro ? ` (now ${metro})` : ""}`);
      } else if (row.open_to_relocation === "Maybe" || row.open_to_relocation === "Depends upon Option") {
        score += 3;
        nears++;
        gaps.push(`In ${metro ?? "another city"}, might relocate`);
      } else {
        misses++;
        gaps.push(`In ${metro ?? "another city"}, not ${card.cities.join(" / ")}`);
      }
    }

    // 6. Experience: inside the range is best, up to two years outside is fine, three is borderline.
    const exp = row.total_experience_years != null ? Number(row.total_experience_years) : null;
    if (exp != null && (card.exp_min != null || card.exp_max != null)) {
      const lo = card.exp_min ?? 0;
      const hi = card.exp_max ?? 99;
      const want = `${lo}-${hi === 99 ? "+" : hi}`;
      if (exp >= lo && exp <= hi) {
        score += 10;
        matched.push(`${exp} years, within range`);
      } else if (exp >= lo - 2 && exp <= hi + 2) {
        score += 6;
        nears++;
        gaps.push(`${exp} years, role wants ${want} (close enough)`);
      } else if (exp >= lo - 3 && exp <= hi + 3) {
        score += 1;
        misses++;
        borderline++;
        gaps.push(`${exp} years, role wants ${want}`);
      } else {
        score -= 10;
        misses++;
        gaps.push(`${exp} years, role wants ${want}`);
      }
    }

    // 7. Pay (expected, else current) against the budget: a couple of lakhs or 10% over is fine; unknown means call and ask.
    const pay = row.expected_fixed_ctc != null ? Number(row.expected_fixed_ctc) : row.current_fixed_ctc != null ? Number(row.current_fixed_ctc) : null;
    if (card.budget_max != null) {
      const tol = Math.max(2, card.budget_max * 0.1);
      if (pay == null) {
        payUnknown = true;
        score += 2;
        gaps.push("Pay expectation not known yet, confirm on a call");
      } else if (pay <= card.budget_max) score += 8;
      else if (pay <= card.budget_max + tol) {
        score += 4;
        nears++;
        gaps.push(`Expects ${pay} LPA, a little above budget ${card.budget_max}`);
      } else if (pay <= card.budget_max * 1.25) {
        score -= 4;
        misses++;
        borderline++;
        gaps.push(`Expects ${pay} LPA, budget ${card.budget_max}`);
      } else {
        score -= 10;
        misses++;
        gaps.push(`Expects ${pay} LPA, budget ${card.budget_max}`);
      }
    }

    // Sales motion: only when both sides say it. Unknown or "both" is never held against anyone.
    if (card.motion && card.motion !== "both" && row.motion && row.motion !== "both") {
      if (row.motion === card.motion) {
        score += 6;
        matched.push(`Sells as a ${row.motion}, as the role needs`);
      } else {
        score -= 8;
        misses++;
        gaps.push(`Sells as a ${row.motion}, the role needs a ${card.motion}`);
      }
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

    // 8 and 9. What we know from a recruiter and from calls. Good people rank higher, but only when they are close to the
    // brief: a top-tier profile far from the requirements gets no lift. A weak communicator in sales is left out of searches.
    const weak = row.comm === "weak";
    const strong = row.quality_tier === "top" || row.pool_tier === "top" || row.pool_tier === "strong" || row.comm === "good";
    if (misses <= 1) {
      if (row.pool_tier === "top") score += 8;
      else if (row.pool_tier === "strong") score += 5;
      else if (row.pool_tier === "watch") score += 2;
      if (row.quality_tier === "top") {
        score += 10;
        matched.push("Top tier: strong on a call and looking");
      } else if (row.comm === "good") {
        score += 4;
        matched.push("Communicates well (rated on a call)");
      }
    }
    if (weak) {
      score -= 6;
      gaps.push("Communication rated weak on a call");
    }

    // Perfect: everything lines up. Close: nothing is really off, a few small give-and-takes, or pay still to confirm; one
    // borderline miss is allowed for a proven good profile. Everything else is a stretch.
    const fnOk = fn === "exact" || fn === "near";
    let bucket: Ranked["bucket"];
    if (!weak && fn === "exact" && misses === 0 && nears === 0 && !payUnknown && worldFit !== "none") bucket = "perfect";
    else if (!weak && fnOk && ((misses === 0 && nears <= 3) || (misses === 1 && borderline === 1 && strong && nears <= 1))) bucket = "close";
    else bucket = "stretch";
    if (weak && !opts.keepAll) continue;
    // Search results hide weak matches; people who already applied are always scored, however low.
    if (score < 35 && bucket === "stretch" && !opts.keepAll) continue;
    out.push({ row, score, bucket, matched, gaps, level, metro });
  }
  return out.sort((a, b) => b.score - a.score);
}
