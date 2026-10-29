// Spots when a candidate who has not been shared yet looks like people this client has already passed on, so the recruiter
// is told before sharing. It only warns; nothing is hidden or ranked down. A pattern needs at least one earlier pass with
// that reason, and the profile has to be on the same side of that pass as the reason says.

export type PassRef = { reason: string; years: number | null; pay: number | null; industry: string | null; city: string | null };
export type ProfileRef = { years: number | null; pay: number | null; industry: string | null; city: string | null };
export type PassPattern = { label: string; count: number; detail: string };

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

export function passPatternsFor(c: ProfileRef, passes: PassRef[]): PassPattern[] {
  const out: PassPattern[] = [];
  const byReason = (r: string) => passes.filter((p) => p.reason === r);

  const senior = byReason("client_too_senior").map((p) => p.years).filter((x): x is number => x != null);
  if (senior.length && c.years != null && c.years >= Math.min(...senior)) {
    out.push({ label: "too senior", count: senior.length, detail: `${c.years} yrs; they passed for seniority at ${Math.min(...senior)}+ yrs` });
  }
  const junior = byReason("client_too_junior").map((p) => p.years).filter((x): x is number => x != null);
  if (junior.length && c.years != null && c.years <= Math.max(...junior)) {
    out.push({ label: "too junior", count: junior.length, detail: `${c.years} yrs; they passed for being junior at up to ${Math.max(...junior)} yrs` });
  }
  const pay = byReason("client_salary").map((p) => p.pay).filter((x): x is number => x != null);
  if (pay.length && c.pay != null && c.pay >= Math.min(...pay)) {
    out.push({ label: "pay too high", count: pay.length, detail: `expects ${c.pay}L; they passed on pay at ${Math.min(...pay)}L+` });
  }
  const inds = new Set(byReason("client_industry").map((p) => norm(p.industry)).filter(Boolean));
  if (inds.size && inds.has(norm(c.industry))) {
    out.push({ label: "industry", count: byReason("client_industry").length, detail: `same industry (${c.industry}) as someone they passed on` });
  }
  const cities = new Set(byReason("client_location").map((p) => norm(p.city)).filter(Boolean));
  if (cities.size && cities.has(norm(c.city))) {
    out.push({ label: "location", count: byReason("client_location").length, detail: `same location (${c.city}) as someone they passed on for location` });
  }
  return out;
}
