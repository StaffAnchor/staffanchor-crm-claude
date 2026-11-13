import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ranked } from "@/lib/role-match";

// What the system remembers from what a person has said on calls: what they want, what they will not accept, strengths,
// concerns and a short summary. It lives on the profile (segment_data.call_insights) and is used three ways: it is shown on
// the profile and on match cards, it is part of the text the semantic search reads, and it lifts or flags a person when a
// new role is ranked. Nothing here changes pay, notice or any other profile field.

export type CallMemory = {
  at: string;
  summary: string;
  wants: string[];
  dealbreakers: string[];
  strengths: string[];
  concerns: string[];
  other_offers: string | null;
  unclear: string[];
};

const CAP = 8;
const clean = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 120) : "")).filter(Boolean).slice(0, max);
const union = (fresh: string[], old: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...fresh, ...old]) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out.slice(0, CAP);
};

/** The read-back of one call, checked and capped, ready to be saved. */
export function cleanReadBack(raw: unknown): Partial<CallMemory> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const out: Partial<CallMemory> = {
    summary,
    wants: clean(r.wants, 6),
    dealbreakers: clean(r.dealbreakers, 6),
    strengths: clean(r.strengths, 6),
    concerns: clean(r.concerns, 6),
    unclear: clean(r.unclear, 6),
    other_offers: typeof r.other_offers === "string" && r.other_offers.trim() ? r.other_offers.trim().slice(0, 160) : null,
  };
  return summary || out.wants!.length || out.dealbreakers!.length || out.strengths!.length || out.concerns!.length ? out : null;
}

/** Folds a new call into what is already remembered: the latest summary wins, the lists add up without repeats. */
export function mergeCallMemory(old: unknown, incoming: Partial<CallMemory>, at: string): CallMemory {
  const o = (old && typeof old === "object" ? old : {}) as Partial<CallMemory> & { preferred?: string[] };
  return {
    at,
    summary: incoming.summary || o.summary || "",
    wants: union(incoming.wants ?? [], clean(o.wants ?? o.preferred, CAP)),
    dealbreakers: union(incoming.dealbreakers ?? [], clean(o.dealbreakers, CAP)),
    strengths: union(incoming.strengths ?? [], clean(o.strengths, CAP)),
    concerns: union(incoming.concerns ?? [], clean(o.concerns, CAP)),
    other_offers: incoming.other_offers ?? o.other_offers ?? null,
    unclear: incoming.unclear?.length ? incoming.unclear : clean(o.unclear, CAP),
  };
}

export function readMemory(segment: unknown): CallMemory | null {
  const raw = (segment as { call_insights?: unknown } | null | undefined)?.call_insights;
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<CallMemory> & { preferred?: string[] };
  const mem: CallMemory = {
    at: typeof m.at === "string" ? m.at : "",
    summary: typeof m.summary === "string" ? m.summary : "",
    wants: clean(m.wants ?? m.preferred, CAP),
    dealbreakers: clean(m.dealbreakers, CAP),
    strengths: clean(m.strengths, CAP),
    concerns: clean(m.concerns, CAP),
    other_offers: typeof m.other_offers === "string" ? m.other_offers : null,
    unclear: clean(m.unclear, CAP),
  };
  return mem.summary || mem.wants.length || mem.dealbreakers.length || mem.strengths.length || mem.concerns.length ? mem : null;
}

/** The sentence block the semantic search reads, so "who wants a channel role in Pune" can find them. */
export function memoryText(m: CallMemory): string {
  const bits: string[] = [];
  if (m.summary) bits.push(`From a call with us: ${m.summary}`);
  if (m.wants.length) bits.push(`They told us they want: ${m.wants.join("; ")}.`);
  if (m.dealbreakers.length) bits.push(`They will not accept: ${m.dealbreakers.join("; ")}.`);
  if (m.strengths.length) bits.push(`Strengths we noted: ${m.strengths.join("; ")}.`);
  if (m.concerns.length) bits.push(`Concerns we noted: ${m.concerns.join("; ")}.`);
  return bits.join(" ");
}

/** Everyone with something remembered, once, for ranking a role. */
export async function loadCallMemory(supabase: SupabaseClient): Promise<Map<string, CallMemory>> {
  const { data } = await supabase.from("candidates").select("id, call_insights:segment_data->call_insights").not("segment_data->call_insights", "is", null).limit(3000);
  const out = new Map<string, CallMemory>();
  for (const r of (data ?? []) as { id: string; call_insights: unknown }[]) {
    const m = readMemory({ call_insights: r.call_insights });
    if (m) out.set(r.id, m);
  }
  return out;
}

// Words that say nothing about what kind of role it is.
const STOP = new Set(["role", "roles", "work", "with", "that", "this", "from", "will", "want", "wants", "sales", "sale", "selling", "job", "jobs", "company", "companies", "level", "only", "pure", "than", "more", "have", "into", "about", "like", "kind", "type", "types", "also", "very", "good", "bigger", "growth", "opportunity", "open", "than", "their", "them", "they", "none", "does", "doing", "move", "moving", "relocate", "relocation", "pay", "salary", "package"]);
const tokens = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((t) => !STOP.has(t)));
const overlaps = (phrases: string[], hay: Set<string>) => phrases.filter((p) => [...tokens(p)].some((t) => hay.has(t)));

/**
 * Lifts people whose remembered wishes name this kind of role, and flags people who said they would not accept it. It reads the role
 * title, cities, role type and selling worlds as plain words, so it is a pointer for the recruiter and not a verdict: the
 * reason is shown, and a flagged Perfect becomes Close at most.
 */
export function applyCallMemory(ranked: Ranked[], memory: Map<string, CallMemory>, roleText: string): Ranked[] {
  if (memory.size === 0) return ranked;
  const hay = tokens(roleText);
  return ranked.map((r) => {
    const m = memory.get(r.row.candidate_id);
    if (!m) return r;
    const when = m.at ? new Date(m.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
    const wanted = overlaps(m.wants, hay);
    // "Will not relocate out of Pune" says nothing against a role in Pune: moving is judged from their relocation answer.
    const refused = overlaps(m.dealbreakers.filter((d) => !/relocat|\bmov(e|ing)\b|shift|transfer|commut/i.test(d)), hay);
    let out = r;
    if (wanted.length) out = { ...out, score: Math.min(100, out.score + 8), matched: [`Told us they want this${when ? ` (${when})` : ""}: ${wanted.join("; ")}`, ...out.matched] };
    if (refused.length) out = { ...out, score: Math.max(0, out.score - 10), bucket: out.bucket === "perfect" ? "close" : out.bucket, gaps: [`Said they will not accept${when ? ` (${when})` : ""}: ${refused.join("; ")}`, ...out.gaps] };
    return out;
  });
}
