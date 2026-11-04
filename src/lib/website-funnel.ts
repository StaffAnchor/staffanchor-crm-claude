// The numbers behind Analytics > Website funnel: who visits jobs.staffanchor.com, who signs up and applies, who comes back, who is on
// WhatsApp, and plain-language findings computed from them. Pure functions over rows, so the page stays small.

export type Touch = { visitor_id: string | null; kind: "visit" | "register" | "apply"; source: string | null; medium: string | null; landing_path: string | null; candidate_id: string | null; mandate_id: string | null; created_at: string };

export const LANDING_GROUPS = ["Home", "Job page", "Jobs list", "Short link (post)", "City page", "Register page", "Edge and resume", "Salary and tools", "Existing candidates (sign-in)", "Employers (client portal)", "Other"] as const;
export type LandingGroup = (typeof LANDING_GROUPS)[number];

export function landingGroup(path: string | null): LandingGroup {
  const p = (path ?? "/").split("?")[0];
  if (p === "/" || p === "") return "Home";
  if (/^\/jobs\/[^/]+/.test(p)) return "Job page";
  if (p === "/jobs") return "Jobs list";
  if (/^\/[jl]\//.test(p)) return "Short link (post)";
  if (p.startsWith("/jobs-in")) return "City page";
  if (p === "/register") return "Register page";
  if (p.startsWith("/candidate-portal") || p.startsWith("/candidate-login") || p === "/login") return "Existing candidates (sign-in)";
  if (p.startsWith("/client")) return "Employers (client portal)";
  if (p.startsWith("/edge") || p.startsWith("/resume")) return "Edge and resume";
  if (p.startsWith("/salary") || p.startsWith("/ats-score") || p.startsWith("/mock-interview")) return "Salary and tools";
  return "Other";
}

// A tidy source name: LinkedIn in its several spellings is one source.
export function sourceName(s: string | null): string {
  const v = (s ?? "direct").toLowerCase();
  if (v.includes("linkedin") || v === "lnkd.in") return "LinkedIn";
  if (v === "direct") return "Direct";
  if (v.startsWith("google")) return "Google";
  if (v.includes("staffanchor")) return "StaffAnchor site";
  if (v.includes("chatgpt") || v.includes("perplexity") || v.includes("claude") || v.includes("gemini")) return "AI assistants";
  if (v.includes("facebook") || v === "fb" || v.includes("instagram") || v === "ig") return "Facebook and Instagram";
  if (v.includes("whatsapp")) return "WhatsApp";
  return "Other";
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
export const pctOf = pct;

export type Visitor = { id: string; visits: number; days: number; first: string; last: string; source: string; groups: LandingGroup[]; signedUp: boolean; applied: boolean; profile: boolean };

export type Analysis = {
  visitors: Visitor[];
  internalExcluded: number;
  employerVisitors: number;
  existingCandidates: number;
  sessions: number;
  signups: number;
  applies: number;
  signupsNoApply: number;
  returning: { n: number; signup: number; rate: number };
  firstTime: { n: number; signup: number; rate: number };
  heavyNoSignup: number;
  bySource: { name: string; visitors: number; signups: number; applies: number; rate: number }[];
  byLanding: { name: LandingGroup; visitors: number; signups: number; rate: number }[];
  daily: { day: string; visits: number; signups: number; applies: number }[];
  medianDaysToSignup: number | null;
};

const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

// Rows from traffic_events. A visitor with a very large number of sessions is our own team testing, and is left out.
export function analyse(rows: Touch[], internalAbove = 25): Analysis {
  const per = new Map<string, Touch[]>();
  for (const r of rows) if (r.visitor_id) per.set(r.visitor_id, [...(per.get(r.visitor_id) ?? []), r]);
  const internal = new Set([...per.entries()].filter(([, t]) => t.filter((x) => x.kind === "visit").length > internalAbove).map(([id]) => id));

  const visitors: Visitor[] = [];
  let employerVisitors = 0;
  let existingCandidates = 0;
  for (const [id, t] of per) {
    if (internal.has(id)) continue;
    const visits = t.filter((x) => x.kind === "visit").sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (visits.length === 0) continue;
    // Someone whose first page was the client portal is an employer, and someone whose first page was their own account or the
    // sign-in page is a candidate who already signed up. Neither is a prospect, so neither belongs in the funnel.
    const firstGroup = landingGroup(visits[0].landing_path);
    if (firstGroup === "Employers (client portal)") {
      employerVisitors++;
      continue;
    }
    if (firstGroup === "Existing candidates (sign-in)") {
      existingCandidates++;
      continue;
    }
    visitors.push({
      id,
      visits: visits.length,
      days: new Set(visits.map((v) => dayOf(v.created_at))).size,
      first: visits[0].created_at,
      last: visits[visits.length - 1].created_at,
      source: sourceName(visits[0].source),
      groups: [...new Set(visits.map((v) => landingGroup(v.landing_path)))],
      signedUp: t.some((x) => x.kind === "register"),
      applied: t.some((x) => x.kind === "apply"),
      profile: t.some((x) => x.kind === "register" || x.kind === "apply"),
    });
  }
  const keep = new Set(visitors.map((v) => v.id));
  const mine = rows.filter((r) => !r.visitor_id || keep.has(r.visitor_id));
  const signups = new Set(mine.filter((r) => r.kind === "register").map((r) => r.candidate_id ?? `${r.visitor_id}${r.created_at}`)).size;
  const applyKeys = new Set(mine.filter((r) => r.kind === "apply").map((r) => `${r.candidate_id}|${r.mandate_id}`));
  const registeredIds = new Set(mine.filter((r) => r.kind === "register").map((r) => r.candidate_id).filter(Boolean));
  const appliedIds = new Set(mine.filter((r) => r.kind === "apply").map((r) => r.candidate_id).filter(Boolean));
  const signupsNoApply = [...registeredIds].filter((id) => !appliedIds.has(id)).length;

  const grp = (list: Visitor[]) => ({ n: list.length, signup: list.filter((v) => v.signedUp).length, rate: pct(list.filter((v) => v.signedUp).length, list.length) });
  const returning = grp(visitors.filter((v) => v.visits >= 2));
  const firstTime = grp(visitors.filter((v) => v.visits < 2));
  const heavyNoSignup = visitors.filter((v) => v.visits >= 3 && !v.signedUp).length;

  const bySource = [...new Set(visitors.map((v) => v.source))]
    .map((name) => {
      const l = visitors.filter((v) => v.source === name);
      return { name, visitors: l.length, signups: l.filter((v) => v.signedUp).length, applies: l.filter((v) => v.applied).length, rate: pct(l.filter((v) => v.signedUp).length, l.length) };
    })
    .sort((a, b) => b.visitors - a.visitors);

  const byLanding = LANDING_GROUPS.map((name) => {
    const l = visitors.filter((v) => v.groups[0] === name);
    return { name, visitors: l.length, signups: l.filter((v) => v.signedUp).length, rate: pct(l.filter((v) => v.signedUp).length, l.length) };
  }).filter((x) => x.visitors > 0).sort((a, b) => b.visitors - a.visitors);

  const days = new Map<string, { visits: number; signups: number; applies: number }>();
  for (const r of mine) {
    const d = dayOf(r.created_at);
    const cur = days.get(d) ?? { visits: 0, signups: 0, applies: 0 };
    if (r.kind === "visit") cur.visits++;
    else if (r.kind === "register") cur.signups++;
    else cur.applies++;
    days.set(d, cur);
  }
  const daily = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, v]) => ({ day, ...v }));

  const lags = visitors.filter((v) => v.signedUp && v.visits >= 2).map((v) => (new Date(v.last).getTime() - new Date(v.first).getTime()) / 86_400_000).sort((a, b) => a - b);
  const medianDaysToSignup = lags.length ? Math.round(lags[Math.floor(lags.length / 2)] * 10) / 10 : null;

  return { visitors, internalExcluded: internal.size, employerVisitors, existingCandidates, sessions: mine.filter((r) => r.kind === "visit").length, signups, applies: applyKeys.size, signupsNoApply, returning, firstTime, heavyNoSignup, bySource, byLanding, daily, medianDaysToSignup };
}

export type Finding = { tone: "good" | "watch" | "act"; title: string; body: string };

// The reading of the numbers: what is working, what is leaking, and what to do about it.
export function findings(a: Analysis, extra: { onWhatsApp: number; signupCandidates: number; optedIn: number; optedInChatted: number; paidCalls: number; edgePaid: number }): Finding[] {
  const out: Finding[] = [];
  const v = a.visitors.length;
  if (v === 0) return out;
  const made = a.visitors.filter((x) => x.profile).length;
  out.push({ tone: "watch", title: `${pct(made, v)}% of visitors create a profile`, body: `${made} of ${v} people who visited signed up or applied, and ${a.applies} application${a.applies === 1 ? "" : "s"} came in. Every other number here is a way of explaining where the rest go.` });

  if (a.returning.n >= 8 && a.firstTime.n >= 8 && a.returning.rate > a.firstTime.rate) {
    const x = Math.round((a.returning.rate / Math.max(a.firstTime.rate, 0.1)) * 10) / 10;
    out.push({ tone: "good", title: `People who come back sign up ${x} times as often`, body: `${a.returning.rate}% of the ${a.returning.n} returning visitors signed up, against ${a.firstTime.rate}% of ${a.firstTime.n} first-time visitors${a.medianDaysToSignup !== null ? (a.medianDaysToSignup < 1 ? ", usually on the same day as their first visit" : `, typically about ${a.medianDaysToSignup} days after their first visit`) : ""}. Coming back is a buying signal, so a return visit is the moment to show a clear next step.` });
  }
  if (a.heavyNoSignup > 0) out.push({ tone: "act", title: `${a.heavyNoSignup} people visited three or more times and never signed up`, body: "They are interested but unconvinced. A short save-your-search or WhatsApp-alert prompt on a third visit is the cheapest way to turn them into candidates." });

  if (a.signups >= 5 && a.signupsNoApply > 0) {
    const share = pct(a.signupsNoApply, a.signups);
    out.push({ tone: share >= 25 ? "act" : "watch", title: `${share}% of signups registered without applying to any role`, body: `${a.signupsNoApply} of ${a.signups} used the Build your profile route. Until the latest release that route showed no Edge, recruiter call or profile-review offer, so these are the candidates to call and to offer a profile review first.` });
  }
  if (extra.signupCandidates >= 5) {
    const optR = pct(extra.optedIn, extra.signupCandidates);
    const chatR = pct(extra.onWhatsApp, extra.signupCandidates);
    out.push({
      tone: extra.optedIn > 0 && extra.optedInChatted / Math.max(1, extra.optedIn) < 0.5 ? "act" : "watch",
      title: `${optR}% ticked the WhatsApp box, but only ${chatR}% have messaged us`,
      body: `${extra.optedIn} of ${extra.signupCandidates} website candidates agreed to WhatsApp updates on the form, so we may send them approved template messages. Only ${extra.onWhatsApp} have actually chatted with us, and ${extra.optedInChatted} of the ${extra.optedIn} who opted in. A first message from them opens a free 24-hour reply window, so the next step is to give the opted-in people a reason to say hello.`,
    });
  }
  const best = a.bySource.filter((s) => s.visitors >= 10).sort((x, y) => y.rate - x.rate);
  if (best.length >= 2) {
    const top = best[0];
    const low = best[best.length - 1];
    out.push({ tone: "watch", title: `${top.name} converts best (${top.rate}%), ${low.name} worst (${low.rate}%)`, body: `Across sources with at least 10 visitors. ${a.bySource[0].name} brings the most traffic (${a.bySource[0].visitors} visitors). Put effort where visitors are many and conversion is decent, and fix the landing page where it is not.` });
  }
  const ll = a.byLanding.filter((l) => l.visitors >= 10);
  if (ll.length >= 2) {
    const top = [...ll].sort((x, y) => y.rate - x.rate)[0];
    const big = ll[0];
    out.push(
      top.name === big.name
        ? { tone: "good", title: `${big.name} brings the most visitors and converts best`, body: `${big.visitors} visitors landed on ${big.name.toLowerCase()} and ${big.rate}% signed up, the best rate of any entry point. The others convert at ${ll.filter((l) => l.name !== big.name).map((l) => `${l.name.toLowerCase()} ${l.rate}%`).join(", ")}.` }
        : { tone: "watch", title: `${big.name} is where most people land, but ${top.name} converts best`, body: `${big.visitors} visitors landed on ${big.name.toLowerCase()} (${big.rate}% signed up), while ${top.name.toLowerCase()} converts at ${top.rate}%. A page that brings traffic but converts poorly is where a clearer first screen pays off.` }
    );
  }
  if (extra.paidCalls + extra.edgePaid === 0 && a.signups >= 10) out.push({ tone: "act", title: "No paid offer has been bought yet from this traffic", body: "Signups are happening but nobody has paid for the recruiter call, an Edge session or a resume. The offers now sit on job pages, after applying, on the register screens and in the footer; judge them after a week of clicks on the Edge scoreboard." });
  else if (extra.paidCalls + extra.edgePaid > 0) out.push({ tone: "good", title: `${extra.paidCalls + extra.edgePaid} paid purchase${extra.paidCalls + extra.edgePaid === 1 ? "" : "s"} from website candidates`, body: `${extra.paidCalls} recruiter call${extra.paidCalls === 1 ? "" : "s"} and ${extra.edgePaid} Edge or resume order${extra.edgePaid === 1 ? "" : "s"} in this period.` });
  return out;
}
