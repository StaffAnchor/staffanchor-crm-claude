import Link from "next/link";
import { Building2, MapPin, Briefcase, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CreateClientForm from "./create-client-form";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("clients")
    .select("id, name, industry, hq_city, website, created_at")
    .order("name", { ascending: true });
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: clients } = await query;

  const { data: mandates } = await supabase.from("mandates").select("id, client_id, status");
  const { data: links } = await supabase.from("candidate_mandate_links").select("mandate_id, in_shortlist");

  const shortlistedByMandate: Record<string, number> = {};
  (links ?? []).forEach((l) => {
    if (l.in_shortlist) shortlistedByMandate[l.mandate_id] = (shortlistedByMandate[l.mandate_id] ?? 0) + 1;
  });

  const statsByClient: Record<string, { open: number; total: number; shortlisted: number }> = {};
  (mandates ?? []).forEach((m) => {
    if (!m.client_id) return;
    const stats = (statsByClient[m.client_id] ??= { open: 0, total: 0, shortlisted: 0 });
    stats.total += 1;
    if (m.status === "open") stats.open += 1;
    stats.shortlisted += shortlistedByMandate[m.id] ?? 0;
  });

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Clients</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {(clients ?? []).length} client{(clients ?? []).length === 1 ? "" : "s"} in your database
            </p>
          </div>
        </div>

        <form className="mb-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search clients by name…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 shadow-sm"
          />
        </form>

        <div className="grid grid-cols-2 gap-4">
          {(clients ?? []).map((c) => {
            const stats = statsByClient[c.id] ?? { open: 0, total: 0, shortlisted: 0 };
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="group bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {c.name}
                  </p>
                  {c.industry && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
                      {c.industry}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-[12px] text-slate-500">
                  {c.hq_city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {c.hq_city}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> {stats.open} open / {stats.total} total
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {stats.shortlisted} shortlisted
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {(clients ?? []).length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl py-16 text-center shadow-sm">
            <Building2 className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {q ? "No clients match your search." : "No clients yet — add your first one."}
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm sticky top-20">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">New client</h2>
          <CreateClientForm />
        </div>
      </div>
    </div>
  );
}
