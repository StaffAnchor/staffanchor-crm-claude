import { metroOfLocation } from "@/lib/metro";

// What a recruiter checks about one person on one role: each must-have, and every concern as a short label.
// Plain functions with no AI call, so they cost nothing and can be used from server and client alike.

export type MustStatus = "met" | "partial" | "not_met" | "ask";
export type MustCheck = { requirement: string; status: MustStatus; note: string };

type Review = { requirements?: { kind?: string; requirement: string; status: "met" | "partial" | "not_met"; note?: string }[] } | null | undefined;
type CvCheck = { requirement: string; status: "met" | "doubt" | "missing"; evidence?: string | null };

type Person = {
  current_location?: string | null;
  open_to_relocation?: string | null;
  total_experience_years?: number | string | null;
};

function fromFacts(requirement: string, p: Person): MustCheck {
  const ask = (note = "Ask on the call"): MustCheck => ({ requirement, status: "ask", note });

  // "Based in Delhi": the city can be read from the profile.
  const wanted = /\b(based|located|residing)\b/i.test(requirement) ? metroOfLocation(requirement) : null;
  if (wanted) {
    const now = metroOfLocation(p.current_location);
    if (!p.current_location) return ask("City not known");
    if (now === wanted) return { requirement, status: "met", note: `In ${wanted}` };
    const where = (now ?? p.current_location).split(",")[0];
    // "Based in or willing to relocate to Pune" is fully met by someone who says they will move.
    if (p.open_to_relocation === "Yes") return { requirement, status: /relocat/i.test(requirement) ? "met" : "partial", note: `In ${where}, says they will move` };
    if (p.open_to_relocation === "No") return { requirement, status: "not_met", note: `In ${where}, will not move` };
    return ask(`In ${where}, ask if they will move`);
  }

  // "10+ years B2B enterprise sales": total years can rule someone out, but cannot prove the kind of experience.
  const years = requirement.match(/^\s*(?:minimum\s+|min\.?\s+|at least\s+)?(\d+)\s*(?:\+|-\s*\d+)?\s*(?:years|yrs)/i);
  if (years) {
    const need = Number(years[1]);
    const has = Number(p.total_experience_years ?? 0);
    if (!has) return ask("Years not known");
    if (has < need) return { requirement, status: "not_met", note: `${has} yrs in total` };
    const generic = /^\D*\d+(?:\s*(?:\+|-\s*\d+))?\s*(?:years|yrs)(?:\s+of)?(?:\s+(?:overall|total|professional|work))*(?:\s+experience)?\s*$/i.test(requirement);
    return generic ? { requirement, status: "met", note: `${has} yrs in total` } : ask(`${has} yrs in total, confirm the kind`);
  }

  return ask();
}

/** Every must-have with the best answer we have: the recruiter's own review, else the CV check, else plain profile facts. */
export function mustChecks(musts: string[], p: Person, review: Review, cv: CvCheck[] | null | undefined): MustCheck[] {
  return musts.map((requirement) => {
    const saved = review?.requirements?.find((r) => r.requirement === requirement);
    if (saved) return { requirement, status: saved.status, note: saved.note?.trim() || "Checked on a call" };
    const read = cv?.find((c) => c.requirement === requirement);
    if (read?.status === "met") return { requirement, status: "met", note: read.evidence ? `CV: ${read.evidence}` : "Seen in the CV" };
    if (read?.status === "doubt") return { requirement, status: "partial", note: read.evidence ? `CV unclear: ${read.evidence}` : "CV is unclear, confirm" };
    return fromFacts(requirement, p);
  });
}

export type Concern = { label: string; detail: string; tone: "warn" | "ask" };

function shortGap(g: string): string {
  let m: RegExpMatchArray | null;
  if ((m = g.match(/^A step (above|below)/))) return `Level ${m[1]}`;
  if (g.startsWith("Level differs")) return "Level differs";
  if ((m = g.match(/^Expects ([\d.]+) LPA, (?:a little above )?budget ([\d.]+)/))) return `Over budget +${Math.round((Number(m[1]) - Number(m[2])) * 10) / 10}L`;
  if (g.startsWith("Sells in a nearby world")) return "Nearby product";
  if (g.startsWith("What they sell is not close")) return "Different product";
  if (g.startsWith("What they sell is not known")) return "Product unknown";
  if (g.startsWith("What they do is not clear")) return "Work unknown";
  if (g.startsWith("Role is close but not the same")) return "Different title";
  if (g.startsWith("Did this job before")) return "Did this before";
  if (g.startsWith("Does a different job")) return "Different job";
  if (g.startsWith("Level not clear")) return "Level unknown";
  if (g.startsWith("Experience not known")) return "Years unknown";
  if (g.startsWith("Pay expectation not known")) return "Pay unknown";
  if (g.startsWith("Not asked if they would relocate")) return "Ask: relocation";
  if (g.startsWith("City not clear")) return "City unknown";
  if (g.startsWith("Sells as a")) return "Selling style differs";
  if (g.startsWith("Communication rated weak")) return "Weak communication";
  if ((m = g.match(/^([\d.]+) years/))) return `${m[1]} yrs`;
  if ((m = g.match(/^In ([^,]+), might relocate/))) return `${m[1]}, may move`;
  if ((m = g.match(/^(?:In|Based in) ([^,]+)/))) return m[1] === "another city" ? "Other city" : m[1];
  return g.length > 28 ? `${g.slice(0, 27)}…` : g;
}

/** Job changes and a large pay jump: not part of the fit score, but a recruiter should see them before calling. */
export function profileConcerns(p: { stability_score?: number | string | null; current_fixed_ctc?: number | string | null; expected_fixed_ctc?: number | string | null }): Concern[] {
  const out: Concern[] = [];
  const stability = p.stability_score != null ? Math.round(Number(p.stability_score)) : null;
  if (stability != null && stability < 50) out.push({ label: "Job changes", detail: `Frequent job changes (stability ${stability} out of 100)`, tone: "warn" });
  const now = Number(p.current_fixed_ctc ?? 0);
  const want = Number(p.expected_fixed_ctc ?? 0);
  if (now > 0 && want > 0) {
    const jump = Math.round((want / now - 1) * 100);
    if (jump >= 40) out.push({ label: `Pay jump +${jump}%`, detail: `Expects ${jump}% more than now (${now} to ${want} LPA)`, tone: "warn" });
  }
  return out;
}

/** All concerns for the list row, the serious ones first. */
export function allConcerns(
  assessment: { red_flags: string[]; missing: string[] } | null,
  p: Parameters<typeof profileConcerns>[0]
): Concern[] {
  const hard = (assessment?.red_flags ?? []).map((g): Concern => ({ label: shortGap(g), detail: g, tone: "warn" }));
  const unknown = (assessment?.missing ?? []).map((m) => m.replace(/ \(confirm on call\)$/, "")).map((g): Concern => ({ label: shortGap(g), detail: g, tone: "ask" }));
  const all = [...hard, ...profileConcerns(p), ...unknown];
  // "Over budget" and a city knockout matter most, so they are never the ones pushed off the end of a row.
  const weight = (c: Concern) => (c.tone === "ask" ? 2 : c.label.startsWith("Over budget") || c.label === "Different job" ? 0 : 1);
  return all.filter((c, i) => all.findIndex((x) => x.label === c.label) === i).sort((a, b) => weight(a) - weight(b));
}
