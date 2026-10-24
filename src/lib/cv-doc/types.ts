// A candidate's CV as it is generated, edited, approved and shared. Pure data and cleaning, no server imports, so the CRM (which
// builds, edits and renders it) and the jobs site (which shows it to the candidate for review) use this one file.
// The jobs site keeps a copy at src/lib/cv-doc/types.ts: change both together.

export type CvRole = { title: string; period: string };
export type CvExp = { id: string; company: string; location: string; period: string; roles: CvRole[]; scope: string; bullets: string[]; tools: string };
export type CvHeader = { name: string; headline: string; email: string; phone: string; city: string; linkedin: string; showPhoto: boolean };
export type CvSkillGroup = { label: string; items: string[] };
export type CvEducation = { degree: string; institution: string; year: string };

export type CvDoc = {
  template: "classic";
  header: CvHeader;
  summary: string;
  highlights: string[];
  experience: CvExp[];
  education: CvEducation[];
  skills: CvSkillGroup[];
  certifications: string[];
  awards: string[];
};

export type DocStatus = "draft" | "in_review" | "approved" | "shared" | "changes_requested" | "final";

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Draft",
  in_review: "Ready for approval",
  approved: "Approved",
  shared: "Shared with candidate",
  changes_requested: "Candidate asked for changes",
  final: "Candidate approved",
};

/** What can still be edited. Once it is approved or the candidate has seen it, a change means a new version, so what they reviewed never changes underneath them. */
export const EDITABLE: DocStatus[] = ["draft", "in_review"];

export type CandidateResponse = { decision: "approved" | "changes"; comments: Record<string, string>; general: string; at: string };

export const emptyDoc = (): CvDoc => ({
  template: "classic",
  header: { name: "", headline: "", email: "", phone: "", city: "", linkedin: "", showPhoto: false },
  summary: "",
  highlights: [],
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  awards: [],
});

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const para = (v: unknown, max = 1500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = <T>(v: unknown, max: number, f: (x: unknown) => T): T[] => (Array.isArray(v) ? v.slice(0, max).map(f) : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{3,40}$/.test(v) ? v : Math.random().toString(36).slice(2, 10));

export function sanitizeDoc(raw: unknown): CvDoc {
  const r = rec(raw);
  const h = rec(r.header);
  return {
    template: "classic",
    header: { name: str(h.name, 120), headline: str(h.headline, 200), email: str(h.email, 160), phone: str(h.phone, 30), city: str(h.city, 80), linkedin: str(h.linkedin, 300), showPhoto: h.showPhoto === true },
    summary: para(r.summary, 1200),
    highlights: arr(r.highlights, 6, (x) => str(x, 240)).filter(Boolean),
    experience: arr(r.experience, 10, (x): CvExp => {
      const e = rec(x);
      return {
        id: id(e.id), company: str(e.company, 120), location: str(e.location, 80), period: str(e.period, 60),
        roles: arr(e.roles, 6, (y): CvRole => ({ title: str(rec(y).title, 120), period: str(rec(y).period, 60) })).filter((y) => y.title || y.period),
        scope: para(e.scope, 500), bullets: arr(e.bullets, 12, (y) => para(y, 400)).filter(Boolean), tools: str(e.tools, 300),
      };
    }),
    education: arr(r.education, 5, (x): CvEducation => ({ degree: str(rec(x).degree, 160), institution: str(rec(x).institution, 160), year: str(rec(x).year, 12) })).filter((x) => x.degree || x.institution),
    skills: arr(r.skills, 6, (x): CvSkillGroup => ({ label: str(rec(x).label, 60), items: arr(rec(x).items, 20, (y) => str(y, 60)).filter(Boolean) })).filter((x) => x.label && x.items.length),
    certifications: arr(r.certifications, 10, (x) => str(x, 160)).filter(Boolean),
    awards: arr(r.awards, 10, (x) => str(x, 200)).filter(Boolean),
  };
}

// ---- the parts a candidate can comment on ----

export type SectionRef = { id: string; title: string };

export function sections(doc: CvDoc): SectionRef[] {
  const out: SectionRef[] = [{ id: "summary", title: "Summary" }];
  if (doc.highlights.length) out.push({ id: "highlights", title: "Career at a glance" });
  for (const e of doc.experience) out.push({ id: `exp:${e.id}`, title: e.company || "Experience" });
  if (doc.education.length) out.push({ id: "education", title: "Education" });
  if (doc.skills.length) out.push({ id: "skills", title: "Skills" });
  if (doc.certifications.length || doc.awards.length) out.push({ id: "extras", title: "Certifications and awards" });
  return out;
}

export function cleanResponse(raw: unknown, validIds: string[]): CandidateResponse | null {
  const r = rec(raw);
  const decision = r.decision === "approved" || r.decision === "changes" ? r.decision : null;
  if (!decision) return null;
  const comments: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(r.comments))) if (validIds.includes(k) && typeof v === "string" && v.trim()) comments[k] = v.trim().slice(0, 1000);
  return { decision, comments, general: para(r.general, 2000), at: new Date().toISOString() };
}
