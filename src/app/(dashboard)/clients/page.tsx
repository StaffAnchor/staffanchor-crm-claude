import Link from "next/link";
import { Building2, MapPin, Briefcase, Users, Trophy, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CreateClientForm from "./create-client-form";
import ClientLeaderboard, { type ClientLeaderRow } from "./client-leaderboard";
import { computeFunnel, pct } from "./funnel-utils";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

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

  const { data: mandates } = await supabase.from("mandates").select("id, client_id, status, created_at");
  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select("mandate_id, in_shortlist, stage");

  const shortlistedByMandate: Record<string, number> = {};
  (links ?? []).forEach((l) => {
    if (l.in_shortlist) shortlistedByMandate[l.mandate_id] = (shortlistedByMandate[l.mandate_id] ?? 0) + 1;
  });

  const statsByClient: Record<string, { open: number; total: number; shortlisted: number }> = {};
  const clientIdByMandate: Record<string, string> = {};
  const oldestOpenMandateByClient: Record<string, string> = {};
  (mandates ?? []).forEach((m) => {
    if (!m.client_id) return;
    clientIdByMandate[m.id] = m.client_id;
    const stats = (statsByClient[m.client_id] ??= { open: 0, total: 0, shortlisted: 0 });
    stats.total += 1;
    if (m.status === "open") {
      stats.open += 1;
      const existing = oldestOpenMandateByClient[m.client_id];
      if (!existing || new Date(m.created_at) < new Date(existing)) {
        oldestOpenMandateByClient[m.client_id] = m.created_at;
      }
    }
    stats.shortlisted += shortlistedByMandate[m.id] ?? 0;
  });

  const stagesByClient: Record<string, (string | null)[]> = {};
  (links ?? []).forEach((l) => {
    const clientId = clientIdByMandate[l.mandate_id];
    if (!clientId) return;
    (stagesByClient[clientId] ??= []).push(l.stage);
  });

  const funnelByClient: Record<string, ReturnType<typeof computeFunnel>> = {};
  (clients ?? []).forEach((c) => {
    funnelByClient[c.id] = computeFunnel(stagesByClient[c.id] ?? []);
  });

  const leaderRows: ClientLeaderRow[] = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    stats: funnelByClient[c.id],
  }));

  // Health signal: a client with an open mandate that's had zero
  // submissions after 14+ days is worth a nudge -- same "days open, no
  // progress" pattern used for mandate cards, rolled up to the client
  // level since that's who a recruiter actually follows up with.
  const STALE_DAYS = 14;
  let clientsNeedingAttention = 0;
  (clients ?? []).forEach((c) => {
    const oldestOpen = oldestOpenMandateByClient[c.id];
    const funnel = funnelByClient[c.id];
    if (oldestOpen && funnel.submittedPlus === 0) {
      const daysSince = Math.floor((Date.now() - new Date(oldestOpen).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= STALE_DAYS) clientsNeedingAttention += 1;
    }
  });

  const totalOpenMandates = Object.values(statsByClient).reduce((sum, s) => sum + s.open, 0);
  const totalPlaced = Object.values(funnelByClient).reduce((sum, f) => sum + f.placed, 0);

  const statTiles = [
    { label: "Clients", value: (clients ?? []).length, icon: Building2, accent: true },
    { label: "Open mandates", value: totalOpenMandates, icon: Briefcase },
    { label: "Total placed", value: totalPlaced, icon: Trophy },
    { label: "Needs attention", value: clientsNeedingAttention, icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Clients</h1>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              {(clients ?? []).length} client{(clients ?? []).length === 1 ? "" : "s"} in your database
            </p>
          </div>
        </div>

        <div className="bg-slate-50/60 rounded-ros-lg p-2 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {statTiles.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.label}>
                  <StatTile label={t.label} value={t.value} icon={<Icon className="w-4 h-4" strokeWidth={2} />} accent={t.accent} />
                </div>
              );
            })}
          </div>
        </div>

        <ClientLeaderboard rows={leaderRows} />

        <form className="mb-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search clients by name…"
            className="w-full rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[13px] outline-none transition-colors duration-200 ease-ros focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 shadow-ros-sm"
          />
        </form>

        <div className="grid grid-cols-2 gap-4">
          {(clients ?? []).map((c) => {
            const stats = statsByClient[c.id] ?? { open: 0, total: 0, shortlisted: 0 };
            const funnel = funnelByClient[c.id];
            const oldestOpen = oldestOpenMandateByClient[c.id];
            const daysSinceOldestOpen = oldestOpen
              ? Math.floor((Date.now() - new Date(oldestOpen).getTime()) / (1000 * 60 * 60 * 24))
              : null;
            const needsAttention =
              daysSinceOldestOpen !== null && daysSinceOldestOpen >= STALE_DAYS && funnel.submittedPlus === 0;

            return (
              <Card key={c.id} interactive padded={false} className="p-0">
                <Link href={`/clients/${c.id}`} className="block p-5">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                    {c.industry && (
                      <Badge tone="neutral" size="sm" className="normal-case tracking-normal shrink-0">
                        {c.industry}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-slate-500 dark:text-slate-400 mb-3">
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

                  {funnel.submittedPlus > 0 && (
                    <div className="flex items-center gap-4 text-[11.5px] text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100">
                      <span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{pct(funnel.subToInterviewRate)}</span>{" "}
                        sub → interview
                      </span>
                      <span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{funnel.placed}</span> placed
                      </span>
                    </div>
                  )}

                  {needsAttention && (
                    <div className="pt-3 mt-3 border-t border-slate-100">
                      <Badge tone="warning" size="sm" icon={<AlertTriangle className="w-2.5 h-2.5" />} className="normal-case tracking-normal">
                        No submissions in {daysSinceOldestOpen}d
                      </Badge>
                    </div>
                  )}
                </Link>
              </Card>
            );
          })}
        </div>

        {(clients ?? []).length === 0 && (
          <EmptyState
            icon={<Building2 className="w-6 h-6 text-slate-400" />}
            title={q ? "No clients match your search" : "No clients yet"}
            description={q ? undefined : "Add your first client using the form on the right."}
          />
        )}
      </div>

      <div>
        <Card className="sticky top-20">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">New client</h2>
          <CreateClientForm />
        </Card>
      </div>
    </div>
  );
}
