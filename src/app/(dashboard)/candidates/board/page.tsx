import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import TalentCard, { type MandateOption, type TalentCardData } from "./talent-card";
import { GROUP_LABEL, type ProfileGroup } from "@/lib/profile-groups";
import { TIER_LABEL, type ReadinessTier } from "@/lib/readiness";
import { buildTalentCards, CARD_COLUMNS } from "@/lib/talent-cards";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type Params = {
  q?: string;
  group?: string;
  ready?: string;
  city?: string;
  industry?: string;
  notice?: string;
  exp_min?: string;
  exp_max?: string;
  ctc_min?: string;
  ctc_max?: string;
  has_cv?: string;
  sort?: string;
  page?: string;
};

type Facets = { cities: { name: string; n: number }[]; industries: { name: string; n: number }[]; notice: Record<string, number>; with_cv: number };
type Counts = { total: number; b2b_sales: number; b2c_sales: number; non_sales: number; unclear: number; ready: number; almost: number; needs_work: number };

const SORTS: Record<string, string> = {
  best: "Best profiles first",
  new: "Newest first",
  notice: "Shortest notice",
  ctc_low: "Expected CTC, low to high",
  exp_high: "Most experienced",
};

const num = (v: string | undefined) => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number) => n.toLocaleString("en-IN");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default async function TalentBoardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) redirect("/candidates");

  const page = Math.max(1, Math.floor(num(p.page) ?? 1));
  const sort = p.sort && SORTS[p.sort] ? p.sort : "best";

  let q = supabase
    .from("candidates")
    .select(CARD_COLUMNS, { count: "exact" });
  const term = (p.q ?? "").replace(/[%_,()]/g, " ").trim();
  if (term) q = q.or(`full_name.ilike.%${term}%,current_employer.ilike.%${term}%,employer_canonical.ilike.%${term}%,current_job_title.ilike.%${term}%`);
  if (p.group && ["b2b_sales", "b2c_sales", "non_sales", "unclear"].includes(p.group)) q = q.eq("profile_group", p.group);
  if (p.ready && ["ready", "almost", "needs_work"].includes(p.ready)) q = q.eq("readiness_tier", p.ready);
  if (p.city) q = q.eq("city_canonical", p.city);
  if (p.industry) q = q.contains("industries", [p.industry]);
  const nd = num(p.notice);
  if (nd !== null) q = q.lte("notice_days_est", nd);
  const [expMin, expMax, ctcMin, ctcMax] = [num(p.exp_min), num(p.exp_max), num(p.ctc_min), num(p.ctc_max)];
  if (expMin !== null) q = q.gte("total_experience_years", expMin);
  if (expMax !== null) q = q.lte("total_experience_years", expMax);
  if (ctcMin !== null) q = q.gte("current_fixed_ctc", ctcMin);
  if (ctcMax !== null) q = q.lte("current_fixed_ctc", ctcMax);
  if (p.has_cv) q = q.not("resume_file_url", "is", null);
  if (sort === "new") q = q.order("created_at", { ascending: false });
  else if (sort === "notice") q = q.order("notice_days_est", { ascending: true, nullsFirst: false }).order("readiness_score", { ascending: false });
  else if (sort === "ctc_low") q = q.order("expected_fixed_ctc", { ascending: true, nullsFirst: false }).order("readiness_score", { ascending: false });
  else if (sort === "exp_high") q = q.order("total_experience_years", { ascending: false, nullsFirst: false });
  else q = q.order("readiness_score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [rowsRes, facetsRes, countsRes, mandatesRes] = await Promise.all([
    q,
    supabase.rpc("talent_board_facets"),
    supabase.rpc("candidate_header_counts", { p_owner: user.id }),
    supabase.from("mandates").select("id, role_title, city").eq("status", "open").order("created_at", { ascending: false }),
  ]);
  const rows = (rowsRes.data ?? []) as Record<string, unknown>[];
  const total = rowsRes.count ?? rows.length;
  const facets = (facetsRes.data ?? { cities: [], industries: [], notice: {}, with_cv: 0 }) as Facets;
  const counts = (countsRes.data ?? null) as Counts | null;
  const mandates = (mandatesRes.data ?? []) as MandateOption[];

  const cards: TalentCardData[] = await buildTalentCards(supabase, rows);
  const ids = cards.map((c) => c.id);
  // Which saved shortlists exist, and which of them each card is already in.
  const [listsRes, memberRes] = await Promise.all([
    supabase.rpc("candidate_lists_with_counts"),
    ids.length ? supabase.from("candidate_list_items").select("list_id, candidate_id").in("candidate_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const lists = ((listsRes.data ?? []) as { id: string; name: string; n: number | string; owner_name: string | null }[]).map((l) => ({ id: l.id, name: l.name, n: Number(l.n), owner_name: l.owner_name }));
  const memberOf = new Map<string, string[]>();
  for (const m of (memberRes.data ?? []) as { list_id: string; candidate_id: string }[]) memberOf.set(m.candidate_id, [...(memberOf.get(m.candidate_id) ?? []), m.list_id]);

  const href = (o: Partial<Record<keyof Params, string | undefined>>) => {
    const merged: Record<string, string | undefined> = { ...p, page: undefined, ...o };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/candidates/board?${s}` : "/candidates/board";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active: { label: string; clear: Partial<Record<keyof Params, undefined>> }[] = [];
  if (p.q) active.push({ label: `"${p.q}"`, clear: { q: undefined } });
  if (p.group) active.push({ label: GROUP_LABEL[p.group as ProfileGroup] ?? p.group, clear: { group: undefined } });
  if (p.ready) active.push({ label: TIER_LABEL[p.ready as ReadinessTier] ?? p.ready, clear: { ready: undefined } });
  if (p.city) active.push({ label: p.city, clear: { city: undefined } });
  if (p.industry) active.push({ label: p.industry, clear: { industry: undefined } });
  if (nd !== null) active.push({ label: nd <= 15 ? "Notice up to 15 days" : `Notice up to ${nd} days`, clear: { notice: undefined } });
  if (expMin !== null || expMax !== null) active.push({ label: `Experience ${expMin ?? 0}–${expMax ?? "any"} yrs`, clear: { exp_min: undefined, exp_max: undefined } });
  if (ctcMin !== null || ctcMax !== null) active.push({ label: `Current CTC ${ctcMin ?? 0}–${ctcMax ?? "any"} LPA`, clear: { ctc_min: undefined, ctc_max: undefined } });
  if (p.has_cv) active.push({ label: "Has a CV", clear: { has_cv: undefined } });

  const facetLink = (label: string, o: Partial<Record<keyof Params, string | undefined>>, isActive: boolean, n?: number) => (
    <Link
      key={label}
      href={href(o)}
      prefetch
      className={`flex items-center justify-between rounded-md px-2 py-1 text-[12.5px] transition-colors ${isActive ? "bg-indigo-600 font-semibold text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
    >
      <span className="truncate">{label}</span>
      {n !== undefined && <span className={`ml-2 text-[11px] tabular-nums ${isActive ? "text-white/80" : "text-slate-400"}`}>{fmt(n)}</span>}
    </Link>
  );

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8">
      <CandidatesSubNav />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-slate-900 dark:text-slate-100">
            <LayoutGrid className="h-5 w-5 text-slate-400" /> Talent board
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
            Browse the talent pool as profiles. {fmt(total)} {total === 1 ? "profile matches" : "profiles match"}. Looking for someone specific?{" "}
            <Link href="/candidates/search" className="font-medium text-indigo-600 hover:underline">
              Describe them in plain words
            </Link>
            .
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          {Object.entries(p).map(([k, v]) => (k !== "q" && k !== "sort" && k !== "page" && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <input name="q" defaultValue={p.q ?? ""} placeholder="Name, company or title" className="w-64 rounded-full border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-[13px] dark:border-slate-700 dark:bg-slate-900" />
          </div>
          <select name="sort" defaultValue={sort} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900">
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="rounded-full bg-slate-900 px-4 py-1.5 text-[13px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">Apply</button>
        </form>
      </div>

      {active.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {active.map((a) => (
            <Link key={a.label} href={href(a.clear)} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[12px] font-medium text-indigo-800 ring-1 ring-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-800">
              {a.label} <X className="h-3 w-3" />
            </Link>
          ))}
          <Link href="/candidates/board" className="text-[12px] font-medium text-slate-500 hover:underline">
            Clear all
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[230px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Section title="Profile type">
            {facetLink("All", { group: undefined }, !p.group, counts?.total)}
            {facetLink("B2B Sales", { group: "b2b_sales" }, p.group === "b2b_sales", counts?.b2b_sales)}
            {facetLink("B2C Sales", { group: "b2c_sales" }, p.group === "b2c_sales", counts?.b2c_sales)}
            {facetLink("Non-Sales", { group: "non_sales" }, p.group === "non_sales", counts?.non_sales)}
          </Section>
          <Section title="Readiness">
            {facetLink("Ready to shortlist", { ready: p.ready === "ready" ? undefined : "ready" }, p.ready === "ready", counts?.ready)}
            {facetLink("Almost there", { ready: p.ready === "almost" ? undefined : "almost" }, p.ready === "almost", counts?.almost)}
            {facetLink("Needs work", { ready: p.ready === "needs_work" ? undefined : "needs_work" }, p.ready === "needs_work", counts?.needs_work)}
          </Section>
          <Section title="Notice period">
            {facetLink("Immediate to 15 days", { notice: p.notice === "15" ? undefined : "15" }, p.notice === "15", facets.notice.immediate)}
            {facetLink("Up to 30 days", { notice: p.notice === "30" ? undefined : "30" }, p.notice === "30", facets.notice.d30)}
            {facetLink("Up to 60 days", { notice: p.notice === "60" ? undefined : "60" }, p.notice === "60", facets.notice.d60)}
            {facetLink("Up to 90 days", { notice: p.notice === "90" ? undefined : "90" }, p.notice === "90", facets.notice.d90)}
          </Section>
          <Section title="City">
            {facets.cities.slice(0, 10).map((c) => facetLink(c.name, { city: p.city === c.name ? undefined : c.name }, p.city === c.name, c.n))}
          </Section>
          <Section title="Industry">
            {facets.industries.slice(0, 10).map((c) => facetLink(c.name, { industry: p.industry === c.name ? undefined : c.name }, p.industry === c.name, c.n))}
          </Section>
          <form method="get" className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            {Object.entries(p).map(([k, v]) => (!["exp_min", "exp_max", "ctc_min", "ctc_max", "page"].includes(k) && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Experience (years)</p>
            <div className="mb-2 flex items-center gap-1.5">
              <input name="exp_min" defaultValue={p.exp_min ?? ""} placeholder="Min" inputMode="decimal" className="w-full rounded-md border border-slate-300 px-2 py-1 text-[12.5px] dark:border-slate-700 dark:bg-slate-900" />
              <span className="text-slate-400">to</span>
              <input name="exp_max" defaultValue={p.exp_max ?? ""} placeholder="Max" inputMode="decimal" className="w-full rounded-md border border-slate-300 px-2 py-1 text-[12.5px] dark:border-slate-700 dark:bg-slate-900" />
            </div>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Current CTC (LPA)</p>
            <div className="mb-2 flex items-center gap-1.5">
              <input name="ctc_min" defaultValue={p.ctc_min ?? ""} placeholder="Min" inputMode="decimal" className="w-full rounded-md border border-slate-300 px-2 py-1 text-[12.5px] dark:border-slate-700 dark:bg-slate-900" />
              <span className="text-slate-400">to</span>
              <input name="ctc_max" defaultValue={p.ctc_max ?? ""} placeholder="Max" inputMode="decimal" className="w-full rounded-md border border-slate-300 px-2 py-1 text-[12.5px] dark:border-slate-700 dark:bg-slate-900" />
            </div>
            <label className="mb-2 flex items-center gap-2 text-[12.5px] text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="has_cv" value="1" defaultChecked={!!p.has_cv} /> Has a CV on file
            </label>
            <button className="w-full rounded-md bg-slate-900 py-1.5 text-[12.5px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">Apply</button>
          </form>
        </aside>

        <section>
          {cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-[13.5px] text-slate-500 dark:border-slate-700">
              No profiles match these filters.{" "}
              <Link href="/candidates/board" className="font-medium text-indigo-600 hover:underline">
                Clear all
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {cards.map((c) => (
                <TalentCard key={c.id} c={c} mandates={mandates} lists={lists} memberOf={memberOf.get(c.id) ?? []} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3 text-[13px]" aria-label="Pages">
              {page > 1 && (
                <Link href={href({ page: String(page - 1) })} className="rounded-full px-3 py-1 font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">
                  ← Previous
                </Link>
              )}
              <span className="text-slate-500">
                Page {page} of {fmt(pages)}
              </span>
              {page < pages && (
                <Link href={href({ page: String(page + 1) })} className="rounded-full px-3 py-1 font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">
                  Next →
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
