import Link from "next/link";
import { Briefcase, CheckCircle2, PauseCircle, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CreateMandateForm from "./create-mandate-form";
import MandatesGrid, { type MandateSummary, type HealthSignal } from "./mandates-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";

function daysOpen(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default async function MandatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("mandates")
    .select("id, client_name, role_title, category, sub_domain, city, status, created_at")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data: mandates } = await query;

  const { data: clientRows } = await supabase.from("mandates").select("client_name").not("client_name", "is", null);
  const existingClients = Array.from(new Set((clientRows ?? []).map((r) => r.client_name).filter(Boolean))).sort();

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select("mandate_id, stage, in_shortlist, shortlisted_at, client_feedback");
  const countsByMandate: Record<string, number> = {};
  const submittedByMandate: Record<string, number> = {};
  const staleFeedbackByMandate: Record<string, number> = {};
  // Same 4-day staleness threshold the mandate detail page's client-feedback
  // nudge already uses -- surfaced here too so it's visible without opening
  // every mandate one at a time.
  const STALE_DAYS = 4;
  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  (links ?? []).forEach((l) => {
    countsByMandate[l.mandate_id] = (countsByMandate[l.mandate_id] ?? 0) + 1;
    if (["submitted", "client_interview", "offer", "placed"].includes(l.stage)) {
      submittedByMandate[l.mandate_id] = (submittedByMandate[l.mandate_id] ?? 0) + 1;
    }
    if (l.in_shortlist && !l.client_feedback && l.shortlisted_at && new Date(l.shortlisted_at).getTime() < staleCutoff) {
      staleFeedbackByMandate[l.mandate_id] = (staleFeedbackByMandate[l.mandate_id] ?? 0) + 1;
    }
  });

  // Also fetch the unfiltered set of mandates so the stat tiles above the
  // list always reflect the whole board, not just whatever status filter
  // is currently applied.
  const { data: allMandates } = await supabase.from("mandates").select("id, status, created_at");
  const statusCounts: Record<string, number> = {};
  let agingCount = 0;
  (allMandates ?? []).forEach((m) => {
    statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
    if (m.status === "open" && daysOpen(m.created_at) >= 21 && !submittedByMandate[m.id]) {
      agingCount += 1;
    }
  });

  const mandateSummaries: MandateSummary[] = (mandates ?? []).map((m) => {
    const linked = countsByMandate[m.id] ?? 0;
    const submitted = submittedByMandate[m.id] ?? 0;
    const stale = staleFeedbackByMandate[m.id] ?? 0;
    const daysOpenNum = daysOpen(m.created_at);

    const signals: HealthSignal[] = [];
    if (m.status === "open" && linked === 0 && daysOpenNum >= 3) {
      signals.push({ label: "Needs sourcing", tone: "warning" });
    }
    if (stale > 0) {
      signals.push({ label: `${stale} awaiting client feedback`, tone: "danger" });
    }
    if (m.status === "open" && daysOpenNum >= 21 && submitted === 0) {
      signals.push({ label: "Aging, no submissions", tone: "warning" });
    }

    return {
      id: m.id,
      client_name: m.client_name,
      role_title: m.role_title,
      category: m.category,
      sub_domain: m.sub_domain,
      city: m.city,
      status: m.status,
      created_at: m.created_at,
      daysOpen: daysOpenNum,
      linked,
      submitted,
      signals,
    };
  });

  const statTiles = [
    { label: "Open", value: statusCounts["open"] ?? 0, icon: CheckCircle2, accent: true, href: "/mandates?status=open" },
    { label: "On hold", value: statusCounts["on_hold"] ?? 0, icon: PauseCircle, href: "/mandates?status=on_hold" },
    { label: "Closed", value: statusCounts["closed"] ?? 0, icon: Briefcase, href: "/mandates?status=closed" },
    { label: "Aging, no submissions", value: agingCount, icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900 tracking-tight">Mandates</h1>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              {(mandates ?? []).length} {status ? `${status.replace("_", " ")} ` : ""}client roles · click any card for a quick view
            </p>
          </div>
        </div>

        <div className="bg-slate-50/60 rounded-ros-lg p-2 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {statTiles.map((t) => {
              const Icon = t.icon;
              const tile = (
                <StatTile label={t.label} value={t.value} icon={<Icon className="w-4 h-4" strokeWidth={2} />} accent={t.accent} className={t.href ? "cursor-pointer" : undefined} />
              );
              return t.href ? <Link key={t.label} href={t.href}>{tile}</Link> : <div key={t.label}>{tile}</div>;
            })}
          </div>
        </div>

        <MandatesGrid mandates={mandateSummaries} />
      </div>
      <div>
        <Card className="sticky top-20">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">New mandate</h2>
          <CreateMandateForm existingClients={existingClients} />
        </Card>
      </div>
    </div>
  );
}
