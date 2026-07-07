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

const FUNNEL_STAGES: { key: string; label: string; bar: string; text: string }[] = [
  { key: "lead_registered", label: "New / Registered", bar: "bg-blue-400", text: "text-blue-700" },
  { key: "under_review", label: "Under Review", bar: "bg-purple-400", text: "text-purple-700" },
  { key: "shortlisted", label: "Shortlisted", bar: "bg-teal-400", text: "text-teal-700" },
  { key: "submitted", label: "Submitted to Client", bar: "bg-indigo-400", text: "text-indigo-700" },
  { key: "client_interview", label: "Client Interview", bar: "bg-cyan-400", text: "text-cyan-700" },
  { key: "offer_placed", label: "Offer / Placed", bar: "bg-green-400", text: "text-green-700" },
];

const CATEGORY_COLOR: Record<string, string> = {
  b2b_sales: "bg-blue-500",
  b2c_sales: "bg-fuchsia-500",
  non_sales: "bg-slate-500",
};

type SearchParams = {
  q?: string;
  category?: string;
  status?: string;
  min_ctc?: string;
  max_ctc?: string;
  min_exp?: string;
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

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

  const { data: allStatuses } = await supabase.from("candidates").select("status");
  const statusCounts: Record<string, number> = {};
  (allStatuses ?? []).forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  });
  const funnelCounts: Record<string, number> = {
    lead_registered: (statusCounts["lead"] ?? 0) + (statusCounts["registered"] ?? 0),
    under_review: statusCounts["under_review"] ?? 0,
    shortlisted: statusCounts["shortlisted"] ?? 0,
    submitted: statusCounts["submitted"] ?? 0,
    client_interview: statusCounts["client_interview"] ?? 0,
    offer_placed: (statusCounts["offer"] ?? 0) + (statusCounts["placed"] ?? 0),
  };

  const totalCount = (allStatuses ?? []).length;
  const awaitingInput = statusCounts["awaiting_input"] ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500">{totalCount} total in the database</p>
        </div>
        <Link
          href="/candidates/new"
          className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 shadow-sm"
        >
          + Create candidate
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-stretch divide-x divide-slate-100">
          <div className="pr-5">
            <p className="text-2xl font-semibold text-slate-900">{totalCount}</p>
            <p className="text-xs text-slate-500">Total candidates</p>
          </div>
          {FUNNEL_STAGES.map((stage) => (
            <div key={stage.key} className="px-5 flex-1 text-center">
              <p className={`text-2xl font-semibold ${stage.text}`}>{funnelCounts[stage.key] ?? 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stage.label}</p>
            </div>
          ))}
          {awaitingInput > 0 && (
            <div className="pl-5 text-center">
              <p className="text-2xl font-semibold text-amber-600">{awaitingInput}</p>
              <p className="text-xs text-slate-500 mt-0.5">Awaiting Input</p>
            </div>
          )}
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden mt-4 bg-slate-100">
          {FUNNEL_STAGES.map((stage) => {
            const pct = totalCount ? ((funnelCounts[stage.key] ?? 0) / totalCount) * 100 : 0;
            return pct > 0 ? (
              <div key={stage.key} className={stage.bar} style={{ width: `${pct}%` }} />
            ) : null;
          })}
        </div>
      </div>

      <form className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end shadow-sm">
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

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
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
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${
                          CATEGORY_COLOR[c.category ?? ""] ?? "bg-slate-400"
                        }`}
                      >
                        {initialsFor(c.full_name)}
                      </div>
                      <div>
                        <Link
                          href={`/candidates/${c.id}`}
                          className="font-medium text-slate-900 hover:text-blue-600"
                        >
                          {c.full_name}
                        </Link>
                        <div className="text-xs text-slate-500">{c.current_location}</div>
                      </div>
                    </div>
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
