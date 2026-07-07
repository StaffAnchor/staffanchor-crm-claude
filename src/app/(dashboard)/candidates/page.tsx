import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  awaiting_input: "Awaiting Input",
  lead: "Lead",
  registered: "Registered",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  submitted: "Submitted to Client",
  client_interview: "Client Interview",
  offer: "Offer",
  placed: "Placed",
  alumni: "Alumni",
  inactive: "Inactive",
};

const STATUS_COLOR: Record<string, string> = {
  awaiting_input: "bg-amber-100 text-amber-800",
  lead: "bg-slate-100 text-slate-700",
  registered: "bg-blue-100 text-blue-800",
  under_review: "bg-purple-100 text-purple-800",
  shortlisted: "bg-teal-100 text-teal-800",
  submitted: "bg-indigo-100 text-indigo-800",
  client_interview: "bg-cyan-100 text-cyan-800",
  offer: "bg-lime-100 text-lime-800",
  placed: "bg-green-100 text-green-800",
  alumni: "bg-slate-100 text-slate-500",
  inactive: "bg-red-100 text-red-700",
};

type SearchParams = {
  q?: string;
  category?: string;
  status?: string;
  min_ctc?: string;
  max_ctc?: string;
  min_exp?: string;
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("candidates")
    .select(
      "id, full_name, email, current_location, category, sub_domain, total_experience_years, current_fixed_ctc, notice_period, status, recruiter_assessment, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.q) {
    query = query.or(
      `full_name.ilike.%${params.q}%,email.ilike.%${params.q}%,current_employer.ilike.%${params.q}%`
    );
  }
  if (params.category) query = query.eq("category", params.category);
  if (params.status) query = query.eq("status", params.status);
  if (params.min_ctc) query = query.gte("current_fixed_ctc", Number(params.min_ctc));
  if (params.max_ctc) query = query.lte("current_fixed_ctc", Number(params.max_ctc));
  if (params.min_exp) query = query.gte("total_experience_years", Number(params.min_exp));

  const { data: candidates, error } = await query;

  const { count: totalCount } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true });
  const { count: needReview } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .in("status", ["lead", "registered"]);
  const { count: awaitingInput } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "awaiting_input");
  const { count: shortlistedCount } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "shortlisted");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500">
            {totalCount ?? 0} total in the database
          </p>
        </div>
        <Link
          href="/candidates/new"
          className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2"
        >
          + Create candidate
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total candidates" value={totalCount ?? 0} />
        <StatCard label="Need first review" value={needReview ?? 0} tone="amber" />
        <StatCard label="Awaiting candidate input" value={awaitingInput ?? 0} tone="amber" />
        <StatCard label="Shortlisted" value={shortlistedCount ?? 0} tone="teal" />
      </div>

      <form className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Name, email, employer..."
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="b2b_sales">B2B Sales</option>
            <option value="b2c_sales">B2C Sales</option>
            <option value="non_sales">Non-Sales</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Min fixed CTC (L)</label>
          <input
            name="min_ctc"
            type="number"
            defaultValue={params.min_ctc}
            className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Max fixed CTC (L)</label>
          <input
            name="max_ctc"
            type="number"
            defaultValue={params.max_ctc}
            className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Min experience (yrs)</label>
          <input
            name="min_exp"
            type="number"
            defaultValue={params.min_exp}
            className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-1.5"
        >
          Filter
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 mb-4">Error loading candidates: {error.message}</p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5">Candidate</th>
              <th className="text-left px-4 py-2.5">Category / Sub-domain</th>
              <th className="text-left px-4 py-2.5">Experience</th>
              <th className="text-left px-4 py-2.5">Fixed CTC</th>
              <th className="text-left px-4 py-2.5">Notice</th>
              <th className="text-left px-4 py-2.5">Recommendation</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(candidates ?? []).map((c) => {
              const recommendation =
                (c.recruiter_assessment as Record<string, unknown> | null)?.[
                  "overall_recommendation"
                ] as string | undefined;
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/candidates/${c.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600"
                    >
                      {c.full_name}
                    </Link>
                    <div className="text-xs text-slate-500">{c.current_location}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.category ? c.category.replace("_", " ") : "—"}
                    <div className="text-xs text-slate-400">{c.sub_domain}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.total_experience_years ?? "—"} yrs
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.current_fixed_ctc ? `₹${c.current_fixed_ctc}L` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.notice_period ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{recommendation ?? "Not assessed"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLOR[c.status] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(candidates ?? []).length === 0 && (
          <p className="text-sm text-slate-500 text-center py-10">
            No candidates match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "teal";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-600"
      : tone === "teal"
      ? "text-teal-600"
      : "text-slate-900";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}
