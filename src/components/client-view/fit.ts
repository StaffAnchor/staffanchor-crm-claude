import type { AiCheck, BoardCandidate, Role } from "./types";

export type FitState = "met" | "partial" | "unmet" | "unknown";
export type FitRow = { key: string; label: string; asked: string; got: string; state: FitState; note?: string };
export type Fit = { rows: FitRow[]; points: number; total: number; pct: number | null; tone: "strong" | "good" | "mixed" | "weak" | "none" };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const lakh = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(1)}L`;

function rangeLabel(min: number | null, max: number | null, fmt: (n: number) => string) {
  if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`;
  if (max !== null) return `Up to ${fmt(max)}`;
  if (min !== null) return `${fmt(min)}+`;
  return "";
}

// "You asked for / They have" rows built from the role's own filters, so every
// shortlisted candidate gets one, with no AI call involved. AI must-have checks
// (when a recruiter has run them) are appended as evidence rows.
export function computeFit(role: Role, c: BoardCandidate): Fit {
  const rows: FitRow[] = [];

  // Function / what they sell
  const roleAreas = (role.sub_domains?.length ? role.sub_domains : role.sub_domain ? [role.sub_domain] : []).filter(Boolean);
  if (roleAreas.length) {
    const cand = Array.from(new Set([c.sub_domain, ...(c.secondary_sub_domains ?? []), ...(c.selling?.sells_now ?? [])].filter((x): x is string => !!x)));
    const candNorm = cand.map(norm);
    const overlap = roleAreas.some((a) => candNorm.some((x) => x === norm(a) || x.includes(norm(a)) || norm(a).includes(x)));
    const sameCategory = !!role.category && role.category === c.category;
    rows.push({
      key: "area",
      label: "Domain",
      asked: roleAreas.slice(0, 3).join(", ") + (roleAreas.length > 3 ? ` +${roleAreas.length - 3}` : ""),
      got: cand.length ? cand.slice(0, 3).join(", ") : "Not stated",
      state: !cand.length ? "unknown" : overlap ? "met" : sameCategory ? "partial" : "unmet",
      note: !overlap && sameCategory && cand.length ? "Related field" : undefined,
    });
  }

  // Experience
  const eMin = role.experience_min;
  const eMax = role.experience_max;
  if (eMin !== null || eMax !== null) {
    const e = num(c.total_experience_years);
    let state: FitState = "unknown";
    if (e !== null) {
      const below = eMin !== null && e < eMin;
      const above = eMax !== null && e > eMax;
      state = !below && !above ? "met" : (below && eMin !== null && eMin - e <= 1) || (above && eMax !== null && e - eMax <= 1) ? "partial" : "unmet";
    }
    rows.push({ key: "exp", label: "Experience", asked: rangeLabel(eMin, eMax, (n) => `${n}`) + " yrs", got: e !== null ? `${e} yrs` : "Not stated", state });
  }

  // Compensation (expected fixed CTC vs the role's budget, in lakhs)
  const bMin = num(role.budget_min);
  const bMax = num(role.budget_max);
  if (bMin !== null || bMax !== null) {
    const exp = num(c.expected_fixed_ctc);
    let state: FitState = "unknown";
    if (exp !== null) {
      state = bMax === null || exp <= bMax ? "met" : exp <= bMax * 1.15 ? "partial" : "unmet";
    }
    rows.push({
      key: "ctc",
      label: "Budget",
      asked: rangeLabel(bMin, bMax, lakh),
      got: exp !== null ? `${lakh(exp)} expected` : "To confirm",
      state,
    });
  }

  // Location
  const cities = (role.cities?.length ? role.cities : role.city ? [role.city] : []).filter(Boolean);
  if (cities.length) {
    const loc = c.current_location ?? "";
    const inCity = !!loc && cities.some((city) => norm(loc).includes(norm(city)));
    const relocates = [c.verified_relocation, c.open_to_relocation].some((v) => v === "Yes" || v === "Maybe");
    rows.push({
      key: "loc",
      label: "Location",
      asked: cities.join(", "),
      got: loc ? loc + (!inCity && relocates ? " · open to relocate" : "") : "Not stated",
      state: !loc ? "unknown" : inCity ? "met" : relocates ? "partial" : "unmet",
    });
  }

  // Work mode
  if (role.work_mode) {
    const cm = c.work_mode ?? "";
    const any = /any/i.test(cm);
    rows.push({
      key: "mode",
      label: "Work mode",
      asked: role.work_mode,
      got: cm || "To confirm",
      state: !cm ? "unknown" : any || norm(cm).includes(norm(role.work_mode)) || norm(role.work_mode).includes(norm(cm)) ? "met" : "unmet",
    });
  }

  // The requirements the client set, as confirmed by their StaffAnchor recruiter. Anything not
  // met is shown as such, with the recruiter's note, so the client decides with full information.
  if (c.share_review?.requirements?.length) {
    c.share_review.requirements.forEach((r, i) =>
      rows.push({
        key: `req-${i}`,
        label: r.kind === "must" ? "Must-have" : "Nice to have",
        asked: r.requirement,
        got: r.status === "met" ? r.note || "Confirmed by your recruiter" : r.note || "To confirm on the call",
        state: r.status === "met" ? "met" : r.status === "partial" ? "partial" : "unmet",
      })
    );
  } else {
    // Older shares with no recruiter review: fall back to the AI check, when one was run.
    const ai = (list: AiCheck[] | undefined, kind: string) =>
      (list ?? []).forEach((chk, i) =>
        rows.push({
          key: `${kind}-${i}`,
          label: kind === "must" ? "Must-have" : "Nice to have",
          asked: chk.requirement,
          got: chk.status === "met" ? chk.evidence ?? "Confirmed from CV" : chk.question ?? "To confirm on the call",
          state: chk.status === "met" ? "met" : "partial",
          note: chk.status === "doubt" ? "To confirm on the call" : undefined,
        })
      );
    ai(c.ai_checks?.must, "must");
    ai(c.ai_checks?.good, "good");
  }

  const scored = rows.filter((r) => r.state !== "unknown");
  const points = scored.reduce((s, r) => s + (r.state === "met" ? 1 : r.state === "partial" ? 0.5 : 0), 0);
  const total = scored.length;
  const pct = total >= 2 ? Math.round((points / total) * 100) : null;
  const tone: Fit["tone"] = pct === null ? "none" : pct >= 85 ? "strong" : pct >= 65 ? "good" : pct >= 45 ? "mixed" : "weak";
  return { rows, points, total, pct, tone };
}

export type Column = "review" | "interested" | "interview" | "closed";

export function columnOf(c: BoardCandidate): Column {
  if (c.stage === "placed" || c.stage === "offer" || c.stage === "rejected" || c.stage === "pulled_back" || c.client_feedback === "not_interested") return "closed";
  if (c.client_feedback === "interview_requested" || c.stage === "client_interview" || c.confirmed_interview_at) return "interview";
  if (c.client_feedback === "interested" || c.stage === "client_shortlisted") return "interested";
  return "review";
}

export function closedReason(c: BoardCandidate): "hired" | "passed" | "withdrawn" {
  if (c.stage === "placed" || c.stage === "offer") return "hired";
  if (c.stage === "pulled_back") return "withdrawn";
  return "passed";
}
