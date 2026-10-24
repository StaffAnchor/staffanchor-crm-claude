import { PROCESS_GROUPS, describeJob, isLeader, jobFilled, jobPeriod, lc, monthLabel, sortPositions, type CvData, type Job } from "../cv-brief/config";
import { emptyDoc, type CvDoc, type CvExp } from "./types";

// The first draft of a CV, written only from what the candidate entered in the form: no AI, nothing added, nothing guessed.
// Every figure keeps the label it was given (personal, team or whole business), because the lines come from the same place the
// form's live preview does. An AI pass may later reword these lines, but it is checked against the figures here.

// "Zenith Cloud Pvt Ltd" reads as "Zenith Cloud" inside a sentence.
const short = (employer: string) => employer.replace(/[,.]?\s+(pvt\.?\s*ltd\.?|private limited|limited|ltd\.?|inc\.?|llp|corp\.?)\s*$/i, "").trim();
const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const split = (s: string) => s.split(/[\n;]|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);

export function buildExperience(j: Job, full: boolean): CvExp {
  const ps = sortPositions(j.positions);
  const roles = (ps.length ? ps : [{ title: j.title, start: j.start, end: j.end, current: j.current }]).map((p) => ({
    title: p.title,
    period: [monthLabel(p.start), p.current ? "Present" : monthLabel(p.end)].filter(Boolean).join(" – "),
  })).filter((r) => r.title || r.period);

  const lines = describeJob(j, full).lines.filter((l) => !l.ghost).map((l) => l.text);
  // The first "Sold ..." line says what the job was about; the rest are the achievements.
  const scopeAt = lines.findIndex((l) => l.startsWith("Sold "));
  const scope = scopeAt >= 0 ? lines[scopeAt] : "";
  const bullets = lines.filter((l, i) => i !== scopeAt && !l.startsWith("Progressed from "));

  if (j.stages.length) bullets.push(`Owned the sale from ${lc(j.stages[0])} to ${lc(j.stages[j.stages.length - 1])}.`);
  if (isLeader(j) && j.leads.length) bullets.push(`Responsible for ${joinList(j.leads.map(lc))}.`);
  const g = j.growth;
  if (g.from && g.to) bullets.push(`Grew from ${g.from} to ${g.to}${g.period ? ` in ${g.period}` : ""}.`);
  if (j.promoted.trim()) bullets.push(`${j.promoted.trim().replace(/\.$/, "")}.`);

  return { id: j.id, company: j.employer, location: j.city, period: jobPeriod(j), roles, scope, bullets, tools: j.tools.join(", ") };
}

function highlightsFor(data: CvData): string[] {
  const jobs = data.jobs.filter(jobFilled);
  const out: string[] = [];
  let best: { pct: number; line: string } | null = null;
  let teamBest: { n: number; company: string } | null = null;
  for (const j of jobs) {
    const t = j.metrics.find((m) => m.key === "target" && m.amount);
    const a = j.metrics.find((m) => m.key === "achieved" && m.amount !== null);
    if (t && a && t.amount && a.amount !== null && t.unit === a.unit && t.currency === a.currency) {
      const pct = Math.round(Math.round((a.amount / t.amount) * 1000) / 10);
      if (!best || pct > best.pct) best = { pct, line: `Achieved ${pct}% of target at ${short(j.employer) || "a previous company"}` };
    }
    const size = j.team.total ?? j.team.direct;
    if (isLeader(j) && size !== null && (!teamBest || size > teamBest.n)) teamBest = { n: size, company: short(j.employer) };
  }
  if (best) out.push(`${best.line}.`);
  if (teamBest) out.push(`Led a team of ${teamBest.n}${teamBest.company ? ` at ${teamBest.company}` : ""}.`);
  const years = data.basics.expYears;
  if (years) out.push(`${years}+ years of sales experience.`);
  return out.slice(0, 4);
}

export function buildDraft(data: CvData, hasPhoto: boolean): CvDoc {
  const d = emptyDoc();
  const jobs = data.jobs.filter(jobFilled);
  const latest = jobs[0];
  const b = data.basics;
  const s = data.story;

  d.header = {
    name: b.name,
    headline: [latest?.title, latest?.industry].filter(Boolean).join(" | "),
    email: b.email, phone: b.phone, city: b.city, linkedin: b.linkedin,
    showPhoto: hasPhoto && data.extras.photoPref === "Yes, include it",
  };

  const industries = Array.from(new Set(jobs.map((j) => j.industry).filter(Boolean)));
  const first = s.headline.trim() || `${b.expYears ? `${b.expYears}+ years of experience` : "Experience"} in ${industries.length ? joinList(industries.slice(0, 2).map(lc)) + " " : ""}sales${latest?.title ? `, most recently as ${latest.title}${latest.employer ? ` at ${short(latest.employer)}` : ""}` : ""}.`;
  d.summary = [
    first,
    s.strengths.length ? `Strengths: ${joinList(s.strengths.map(lc))}.` : "",
    s.style ? `Selling style: ${lc(s.style)}.` : "",
    s.knownFor.trim() ? `Known for ${s.knownFor.trim().replace(/^known for\s+/i, "").replace(/\.$/, "")}.` : "",
  ].filter(Boolean).join(" ");

  d.highlights = highlightsFor(data);
  d.experience = jobs.map((j, i) => buildExperience(j, i < 2));
  d.education = b.educations.length ? b.educations : b.educationDetail ? [{ degree: b.educationDetail, institution: "", year: "" }] : [];

  const processes = Array.from(new Set(jobs.flatMap((j) => j.processes.map((p) => p.label || PROCESS_GROUPS.flatMap((g) => g.items).find((i) => i.key === p.key)?.label || ""))))
    .filter(Boolean);
  const tools = Array.from(new Set(jobs.flatMap((j) => j.tools)));
  d.skills = [
    { label: "Selling strengths", items: s.strengths },
    { label: "Sales processes", items: processes.slice(0, 12) },
    { label: "Tools", items: tools },
    { label: "Languages", items: data.extras.languages },
  ].filter((g) => g.items.length);
  d.certifications = split(data.extras.certifications);
  d.awards = split(data.extras.awards);
  return d;
}
