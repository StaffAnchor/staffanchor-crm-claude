import Link from "next/link";
import { Building2, MapPin, Users, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CreateMandateForm from "./create-mandate-form";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  on_hold: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  closed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  filled: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
};

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

  const { data: links } = await supabase.from("candidate_mandate_links").select("mandate_id, stage");
  const countsByMandate: Record<string, number> = {};
  const submittedByMandate: Record<string, number> = {};
  (links ?? []).forEach((l) => {
    countsByMandate[l.mandate_id] = (countsByMandate[l.mandate_id] ?? 0) + 1;
    if (["submitted", "client_interview", "offer", "placed"].includes(l.stage)) {
      submittedByMandate[l.mandate_id] = (submittedByMandate[l.mandate_id] ?? 0) + 1;
    }
  });

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Mandates</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {(mandates ?? []).length} open client roles
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(mandates ?? []).map((m) => {
            const linked = countsByMandate[m.id] ?? 0;
            const submitted = submittedByMandate[m.id] ?? 0;
            const progressPct = linked ? Math.round((submitted / linked) * 100) : 0;
            return (
              <Link
                key={m.id}
                href={`/mandates/${m.id}`}
                className="group bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {m.role_title}
                    </p>
                    <p className="text-[13px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3" /> {m.client_name}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                      STATUS_STYLE[m.status] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {m.status.replace("_", " ")}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-[12px] text-slate-500 mb-3">
                  {m.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {m.city}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {linked} linked
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {daysOpen(m.created_at)}d open
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Pipeline progress</span>
                    <span>{submitted}/{linked || 0} submitted+</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {(mandates ?? []).length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl py-16 text-center shadow-sm">
            <p className="text-sm text-slate-500">No mandates match this view.</p>
          </div>
        )}
      </div>
      <div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm sticky top-20">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">New mandate</h2>
          <CreateMandateForm />
        </div>
      </div>
    </div>
  );
}
