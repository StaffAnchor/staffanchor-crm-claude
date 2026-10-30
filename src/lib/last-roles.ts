// The last two jobs of a person, for scanning a pipeline quickly: what they did, where, and when. Read from the structured
// CV facts first, then from the career timelines, and never invented.

export type LastRole = { title: string; company: string | null; period: string };

type Raw = { title?: unknown; company?: unknown; start?: unknown; end?: unknown; is_current?: unknown; start_month?: unknown; end_month?: unknown };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null);
const yearOf = (v: unknown): string | null => {
  const s = str(v);
  const m = s?.match(/(19|20)\d{2}/);
  return m ? m[0] : null;
};

function toRoles(list: unknown): { title: string; company: string | null; start: string | null; end: string | null; current: boolean }[] {
  if (!Array.isArray(list)) return [];
  const out: { title: string; company: string | null; start: string | null; end: string | null; current: boolean }[] = [];
  for (const r of list as Raw[]) {
    if (!r || typeof r !== "object") continue;
    const title = str(r.title);
    if (!title) continue;
    const end = str(r.end) ?? str(r.end_month);
    out.push({ title, company: str(r.company), start: str(r.start) ?? str(r.start_month), end, current: r.is_current === true || (r.is_current == null && !end) });
  }
  return out;
}

/** Newest first: the current job, then by start date. */
export function lastTwoRoles(...sources: unknown[]): LastRole[] {
  for (const src of sources) {
    const roles = toRoles(src);
    if (roles.length === 0) continue;
    roles.sort((a, b) => Number(b.current) - Number(a.current) || (b.start ?? "").localeCompare(a.start ?? ""));
    return roles.slice(0, 2).map((r) => {
      const from = yearOf(r.start);
      const to = r.current ? "Now" : yearOf(r.end);
      const period = from ? (to && to !== from ? `${from}–${to}` : to === from ? from : from) : to ?? "";
      return { title: r.title, company: r.company, period };
    });
  }
  return [];
}
