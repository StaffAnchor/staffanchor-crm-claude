// Builds the text a recruiter pastes into a LinkedIn job post or feed post. Same client-name rule as the JD PDF: a
// hidden client is never named. Returns HTML (real bold headers and bullet lists, which LinkedIn's job editor keeps
// when pasted) and plain text (headers in capitals, "•" bullets, which is what a feed post or any plain field keeps).

export type LinkedinJdMandate = {
  role_title: string;
  client_name: string | null;
  show_client_name: boolean | null;
  public_client_label: string | null;
  category: string | null;
  city: string | null;
  cities: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  experience_min: number | null;
  experience_max: number | null;
  work_mode: string | null;
  jd_overview: string | null;
  jd_responsibilities: string | null;
  jd_candidate_profile: string | null;
  jd_compensation_benefits: string | null;
  must_haves: string[] | null;
  good_to_haves: string[] | null;
  status?: string | null;
  short_code?: string | null;
};

const CATEGORY_LABEL: Record<string, string> = { b2b_sales: "B2B Sales", b2c_sales: "B2C Sales", non_sales: "Non-Sales" };
const JOBS_SITE = process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com";

const lines = (v: string | null) => (v ?? "").split("\n").map((l) => l.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function clientName(m: LinkedinJdMandate): string {
  if (m.show_client_name !== false) return m.client_name ?? "a confidential client";
  return m.public_client_label?.trim() || "a confidential client";
}

type Block = { heading: string; paragraph?: string; bullets?: string[] };

export function linkedinJd(m: LinkedinJdMandate): { html: string; text: string } {
  const cities = m.cities?.length ? m.cities : m.city ? [m.city] : [];
  const exp = m.experience_min != null || m.experience_max != null
    ? m.experience_min != null && m.experience_max != null && m.experience_min !== m.experience_max ? `${m.experience_min}-${m.experience_max} years` : `${m.experience_min ?? m.experience_max} years`
    : null;
  const comp = m.budget_min || m.budget_max
    ? m.budget_min && m.budget_max && m.budget_min !== m.budget_max ? `Rs ${m.budget_min}-${m.budget_max} LPA` : `Rs ${m.budget_min ?? m.budget_max} LPA`
    : null;
  const quick = [
    m.category ? ["Function", CATEGORY_LABEL[m.category] ?? m.category] : null,
    cities.length ? ["Location", cities.join(", ")] : null,
    exp ? ["Experience", exp] : null,
    comp ? ["Compensation", comp] : null,
    m.work_mode ? ["Work mode", m.work_mode] : null,
  ].filter(Boolean) as [string, string][];

  const blocks: Block[] = [];
  if (quick.length) blocks.push({ heading: "Role at a glance", bullets: quick.map(([k, v]) => `${k}: ${v}`) });
  if (m.jd_overview?.trim()) blocks.push({ heading: "About the role", paragraph: m.jd_overview.trim() });
  if (lines(m.jd_responsibilities).length) blocks.push({ heading: "What you will do", bullets: lines(m.jd_responsibilities) });
  if (lines(m.jd_candidate_profile).length) blocks.push({ heading: "Who we are looking for", bullets: lines(m.jd_candidate_profile) });
  if (m.must_haves?.length) blocks.push({ heading: "Must have", bullets: m.must_haves });
  if (m.good_to_haves?.length) blocks.push({ heading: "Good to have", bullets: m.good_to_haves });
  if (lines(m.jd_compensation_benefits).length) blocks.push({ heading: "Compensation and benefits", bullets: lines(m.jd_compensation_benefits) });

  const intro = `An exclusive search by StaffAnchor on behalf of ${clientName(m)}.`;
  const apply = m.status === "open" && m.short_code ? `${JOBS_SITE}/j/${m.short_code}?utm_source=linkedin&utm_medium=post` : null;

  const text = [
    m.role_title,
    intro,
    ...blocks.map((b) => [b.heading.toUpperCase(), b.paragraph, ...(b.bullets ?? []).map((x) => `• ${x}`)].filter(Boolean).join("\n")),
    apply ? `APPLY\nSee the role and apply here: ${apply}` : "",
  ].filter(Boolean).join("\n\n");

  const html =
    `<p><b>${esc(m.role_title)}</b></p><p>${esc(intro)}</p>` +
    blocks.map((b) => `<p><b>${esc(b.heading)}</b></p>${b.paragraph ? `<p>${esc(b.paragraph)}</p>` : ""}${b.bullets ? `<ul>${b.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`).join("") +
    (apply ? `<p><b>Apply</b></p><p>See the role and apply here: <a href="${apply}">${esc(apply)}</a></p>` : "");

  return { html, text };
}
