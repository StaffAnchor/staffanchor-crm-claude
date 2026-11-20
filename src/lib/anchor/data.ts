import type { SupabaseClient } from "@supabase/supabase-js";
import type { Range } from "./intents";

// What Anchor and the Home pages read: who was placed, what was billed and collected, and where a name leads. Everything
// is read with the caller's own session except fees, which the callers only run for admins.

const IST_NOW = () => new Date(Date.now() + 5.5 * 3_600_000);
/** Today in India as YYYY-MM-DD. */
export const istToday = () => IST_NOW().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => new Date(IST_NOW().getTime() - n * 86_400_000).toISOString().slice(0, 10);
const inRange = (date: string | null, range: Range) => (range === "life" ? true : !!date && date >= daysAgoStr(range) && date <= istToday());

export const RANGES: Range[] = [30, 60, 90, "life"];
export const rangeKey = (r: Range) => String(r);
export const parseRangeParam = (v: string | undefined): Range => (v === "60" ? 60 : v === "90" ? 90 : v === "life" ? "life" : 30);

export type PlacedRow = { linkId: string; candidateId: string; mandateId: string; candidate: string; client: string; role: string; joined: string | null; joinStatus: string | null };
export type PlacedResult = { rows: PlacedRow[]; counts: Record<string, number> };

/** Everyone currently in the Placed stage, newest joiner first, with how many fall in each window. Joining date, or the day they were marked placed when none was set. */
export async function loadPlaced(supabase: SupabaseClient, range: Range): Promise<PlacedResult> {
  const { data } = await supabase
    .from("candidate_mandate_links")
    .select("id, candidate_id, mandate_id, date_of_joining, join_status, stage_updated_at, candidates(full_name), mandates(role_title, client_name)")
    .eq("stage", "placed")
    .limit(2000);
  type R = { id: string; candidate_id: string; mandate_id: string; date_of_joining: string | null; join_status: string | null; stage_updated_at: string | null; candidates: { full_name: string | null } | { full_name: string | null }[] | null; mandates: { role_title: string | null; client_name: string | null } | { role_title: string | null; client_name: string | null }[] | null };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const all = ((data ?? []) as unknown as R[]).filter((r) => r.join_status !== "did_not_join").map((r): PlacedRow => ({
    linkId: r.id,
    candidateId: r.candidate_id,
    mandateId: r.mandate_id,
    candidate: one(r.candidates)?.full_name ?? "Unknown",
    client: one(r.mandates)?.client_name ?? "Unknown client",
    role: one(r.mandates)?.role_title ?? "Role",
    joined: r.date_of_joining ?? (r.stage_updated_at ? r.stage_updated_at.slice(0, 10) : null),
    joinStatus: r.join_status,
  }));
  const counts: Record<string, number> = { "30": 0, "60": 0, "90": 0, life: all.length };
  for (const r of all) for (const k of [30, 60, 90] as const) if (inRange(r.joined, k)) counts[String(k)]++;
  const rows = all.filter((r) => inRange(r.joined, range)).sort((a, b) => (b.joined ?? "").localeCompare(a.joined ?? ""));
  return { rows, counts };
}

export type FeeRow = {
  id: string;
  client: string;
  candidate: string;
  role: string;
  label: string;
  status: string;
  /** Rupees before GST. A fee not yet invoiced is stored in lakhs (2.25 = 2.25 lakh); once an invoice is made it is overwritten with rupees. Values under 1,000 are read as lakhs and converted. */
  amount: number;
  due: string | null;
  paidAt: string | null;
  /** Converted from lakhs: an estimate until the invoice is raised. */
  estimated: boolean;
  /** Paid, and inside the chosen period. */
  paidInRange: boolean;
};
export type FeeResult = {
  collected: number;
  collectedCount: number;
  outstanding: number;
  outstandingCount: number;
  overdueCount: number;
  estimatedCount: number;
  rows: FeeRow[];
  byClient: { client: string; outstanding: number; collected: number }[];
};

export async function loadFees(admin: SupabaseClient, range: Range): Promise<FeeResult> {
  const { data } = await admin
    .from("placement_fee_tranches")
    .select("id, label, amount_lakhs, due_date, status, payment_received_at, cancelled_at, mandates(role_title, client_name), candidate_mandate_links(candidates(full_name))")
    .order("due_date", { ascending: false })
    .limit(2000);
  type R = { id: string; label: string | null; amount_lakhs: number | string | null; due_date: string | null; status: string | null; payment_received_at: string | null; cancelled_at: string | null; mandates: { role_title: string | null; client_name: string | null } | { role_title: string | null; client_name: string | null }[] | null; candidate_mandate_links: { candidates: { full_name: string | null } | { full_name: string | null }[] | null } | { candidates: { full_name: string | null } | { full_name: string | null }[] | null }[] | null };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const today = istToday();
  const rows: FeeRow[] = [];
  for (const r of (data ?? []) as unknown as R[]) {
    if (r.cancelled_at || r.status === "cancelled") continue;
    const raw = Number(r.amount_lakhs ?? 0);
    const estimated = raw > 0 && raw < 1000;
    const amount = estimated ? Math.round(raw * 100_000) : raw;
    const link = one(r.candidate_mandate_links);
    rows.push({
      id: r.id,
      client: one(r.mandates)?.client_name ?? "Unknown client",
      candidate: one(link?.candidates ?? null)?.full_name ?? "Unknown",
      role: one(r.mandates)?.role_title ?? "Role",
      label: r.label ?? "Placement",
      status: r.status ?? "pending",
      amount,
      due: r.due_date,
      paidAt: r.payment_received_at,
      estimated,
      paidInRange: !!r.payment_received_at && inRange(r.payment_received_at.slice(0, 10), range),
    });
  }
  let collected = 0, collectedCount = 0, outstanding = 0, outstandingCount = 0, overdueCount = 0, estimatedCount = 0;
  const by = new Map<string, { outstanding: number; collected: number }>();
  const bucket = (c: string) => by.get(c) ?? (by.set(c, { outstanding: 0, collected: 0 }), by.get(c)!);
  for (const r of rows) {
    if (r.estimated) estimatedCount++;
    if (r.paidAt) {
      if (!inRange(r.paidAt.slice(0, 10), range)) continue;
      collectedCount++;
      collected += r.amount;
      bucket(r.client).collected += r.amount;
    } else {
      outstandingCount++;
      if (r.due && r.due < today) overdueCount++;
      outstanding += r.amount;
      bucket(r.client).outstanding += r.amount;
    }
  }
  return {
    collected, collectedCount, outstanding, outstandingCount, overdueCount, estimatedCount, rows,
    byClient: [...by.entries()].map(([client, v]) => ({ client, ...v })).sort((a, b) => b.outstanding + b.collected - (a.outstanding + a.collected)),
  };
}

export type Target = { type: "mandate" | "candidate" | "client"; id: string; label: string; sub: string; href: string };

const clean = (q: string) => q.replace(/[%_,()*"\\]/g, " ").replace(/\s+/g, " ").trim();

/** Where a name leads: mandates by role or client, candidates by name, clients by name. Every word must match, so "service manager" finds that role and not every manager. */
export async function findTargets(supabase: SupabaseClient, rawQ: string, type: "mandate" | "candidate" | "client" | null): Promise<Target[]> {
  const q = clean(rawQ);
  if (q.length < 2) return [];
  const words = q.toLowerCase().split(" ").filter((w) => w.length >= 2);
  if (!words.length) return [];
  const seed = [...words].sort((a, b) => b.length - a.length)[0];
  const all = (hay: string) => words.every((w) => hay.toLowerCase().includes(w));
  const out: Target[] = [];

  if (!type || type === "mandate") {
    const { data } = await supabase.from("mandates").select("id, role_title, client_name, status, city").or(`role_title.ilike.%${seed}%,client_name.ilike.%${seed}%`).limit(60);
    const hits = ((data ?? []) as { id: string; role_title: string | null; client_name: string | null; status: string | null; city: string | null }[]).filter((m) => all(`${m.role_title ?? ""} ${m.client_name ?? ""}`));
    hits.sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1));
    for (const m of hits.slice(0, 6)) out.push({ type: "mandate", id: m.id, label: m.role_title ?? "Role", sub: `${m.client_name ?? "Client"} · ${m.status ?? ""}${m.city ? ` · ${m.city}` : ""}`, href: `/mandates/${m.id}` });
  }
  if (!type || type === "client") {
    const { data } = await supabase.from("clients").select("id, name, industry, hq_city").ilike("name", `%${seed}%`).limit(30);
    const hits = ((data ?? []) as { id: string; name: string | null; industry: string | null; hq_city: string | null }[]).filter((c) => all(c.name ?? ""));
    for (const c of hits.slice(0, 4)) out.push({ type: "client", id: c.id, label: c.name ?? "Client", sub: `Client${c.industry ? ` · ${c.industry}` : ""}${c.hq_city ? ` · ${c.hq_city}` : ""}`, href: `/clients/${c.id}` });
  }
  if (!type || type === "candidate") {
    const { data } = await supabase.from("candidates").select("id, full_name, current_job_title, current_employer").ilike("full_name", `%${seed}%`).limit(40);
    const hits = ((data ?? []) as { id: string; full_name: string | null; current_job_title: string | null; current_employer: string | null }[]).filter((c) => all(c.full_name ?? ""));
    for (const c of hits.slice(0, 5)) out.push({ type: "candidate", id: c.id, label: c.full_name ?? "Candidate", sub: [c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || "Candidate", href: `/candidates/${c.id}` });
  }
  return out;
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "No date");
