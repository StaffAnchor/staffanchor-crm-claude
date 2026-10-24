import type { CvData, Job, Metric } from "../cv-brief/config";
import type { CvDoc } from "./types";

// Checks a CV against the answers it came from, so nothing the candidate did not say can slip in, whether an AI reworded a line
// or a person edited it. Figures are the thing that matters most on a sales CV, so every number must trace back to the form,
// team and business figures must not read as personal, and approximate figures must not read as exact.

export type Flag = { level: "warn" | "info"; where: string; text: string; message: string };

/** The numbers in a piece of text, written one way (no commas, no trailing zeros), so 1,20,000 and 120000 match. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(parseFloat(n.replace(/,/g, "")))).filter((n) => n !== "NaN");
}

const strip = (_k: string, v: unknown) => (_k === "id" || _k === "key" || _k === "fromCv" || _k === "checked" ? undefined : v);
const numbersOf = (x: unknown) => numbersIn(JSON.stringify(x, strip));

/** Every number that may appear in the lines for one job: the ones the candidate gave, and the target attainment worked out from them. */
export function allowedForJob(j: Job): Set<string> {
  const ok = new Set(numbersOf(j));
  const t = j.metrics.find((m) => m.key === "target" && m.amount);
  const a = j.metrics.find((m) => m.key === "achieved" && m.amount !== null);
  if (t?.amount && a?.amount !== null && a?.amount !== undefined) ok.add(String(Math.round(Math.round((a.amount / t.amount) * 1000) / 10)));
  return ok;
}

export const allowedAll = (d: CvData): Set<string> => {
  const ok = new Set(numbersOf(d));
  for (const j of d.jobs) for (const n of allowedForJob(j)) ok.add(n);
  return ok;
};

// Words that make clear a figure is the team's or the business's. "New business" and "the company" do not, so they are left out.
const TEAM_WORDS = /\b(team|teams|portfolio|region|regional|organi[sz]ation|department|branch|division|group|managers?|reports?|whole business|entire business|business unit|business-wide|company-wide)\b/i;
const APPROX_WORDS = /\b(about|approx|approximately|roughly|around|nearly|almost|over|more than|c\.|~)/i;

function metricNumbers(ms: Metric[], pick: (m: Metric) => boolean): Set<string> {
  const out = new Set<string>();
  for (const m of ms) if (pick(m) && m.amount !== null) numbersIn(String(m.amount)).forEach((n) => out.add(n));
  return out;
}

export function checkDoc(doc: CvDoc, data: CvData, hasPhoto: boolean): Flag[] {
  const flags: Flag[] = [];
  const all = allowedAll(data);

  const figures = (where: string, text: string, allowed: Set<string>) => {
    for (const n of new Set(numbersIn(text))) if (!allowed.has(n)) flags.push({ level: "warn", where, text, message: `The figure ${n} is not in the candidate's answers.` });
  };

  figures("Summary", doc.summary, all);
  doc.highlights.forEach((h) => figures("Career at a glance", h, all));

  for (const e of doc.experience) {
    const j = data.jobs.find((x) => x.id === e.id);
    const where = e.company || "Experience";
    if (!j) {
      flags.push({ level: "info", where, text: e.company, message: "This job is not in the form answers any more, so its figures cannot be checked." });
      continue;
    }
    const allowed = allowedForJob(j);
    const own = metricNumbers(j.metrics, (m) => m.scope === "own");
    const other = metricNumbers(j.metrics, (m) => m.scope !== "own");
    const approx = metricNumbers(j.metrics, (m) => m.basis === "estimate");
    for (const line of [e.scope, ...e.bullets]) {
      if (!line) continue;
      figures(where, line, allowed);
      for (const n of new Set(numbersIn(line))) {
        if (other.has(n) && !own.has(n) && !TEAM_WORDS.test(line)) flags.push({ level: "warn", where, text: line, message: `${n} is a team or business figure, but this line reads as personal.` });
        if (approx.has(n) && !APPROX_WORDS.test(line) && !/approx/i.test(line)) flags.push({ level: "info", where, text: line, message: `${n} is the candidate's own estimate. Consider saying "about" or "roughly".` });
      }
    }
    if (!e.bullets.length) flags.push({ level: j === data.jobs[0] ? "warn" : "info", where, text: "", message: "No achievement lines for this job." });
  }

  if (!doc.summary.trim()) flags.push({ level: "warn", where: "Summary", text: "", message: "There is no summary." });
  if (!doc.education.length) flags.push({ level: "info", where: "Education", text: "", message: "No education listed." });

  // Nothing private may reach the CV: pay, and the notes they asked us to handle sensitively.
  const text = JSON.stringify(doc);
  const gaps = data.extras.gaps.trim();
  if (gaps.length >= 12 && text.toLowerCase().includes(gaps.slice(0, 30).toLowerCase())) flags.push({ level: "warn", where: "Whole CV", text: gaps.slice(0, 60), message: "This is from the private notes the candidate asked us to handle sensitively. Remove it." });
  if (/\b(ctc|lpa|salary|lakhs? per annum|current pay|expected pay)\b/i.test(text)) flags.push({ level: "warn", where: "Whole CV", text: "", message: "Pay details appear on the CV. The candidate was told pay is never put on it." });

  if (data.extras.confidential) flags.push({ level: "info", where: "Whole CV", text: "", message: "The candidate said some figures are confidential. Prefer broad numbers." });
  if (doc.header.showPhoto && !hasPhoto) flags.push({ level: "warn", where: "Header", text: "", message: "The photo is switched on but none was uploaded." });
  if (!doc.header.showPhoto && hasPhoto && data.extras.photoPref === "Yes, include it") flags.push({ level: "info", where: "Header", text: "", message: "The candidate wants their photo on the CV and it is switched off." });
  if (data.extras.photoPref === "Not sure, advise me" && hasPhoto) flags.push({ level: "info", where: "Header", text: "", message: "The candidate asked for advice on whether to include a photo." });
  return flags;
}
