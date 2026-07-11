import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Briefcase, MapPin, ArrowRight } from "lucide-react";

export type VendorMandate = {
  mandate_id: string;
  role_title: string;
  client_display: string;
  category: string | null;
  sub_domain: string | null;
  cities: string[] | null;
  status: string;
  experience_min: number | null;
  experience_max: number | null;
  my_submission_count: number;
  assigned_at: string;
};

export default async function VendorMandatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_vendor_mandates");
  const mandates: VendorMandate[] = (error ? [] : data ?? []) as VendorMandate[];

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-6">
      <h1 className="text-[20px] font-semibold text-slate-900">My Mandates</h1>
      <p className="text-[13px] text-slate-500 mt-0.5 mb-5">
        {mandates.length === 0
          ? "You haven't been staffed on any mandates yet."
          : `${mandates.length} mandate${mandates.length === 1 ? "" : "s"} assigned to you`}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          Couldn&apos;t load your mandates: {error.message}
        </div>
      )}

      {mandates.length === 0 && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 flex flex-col items-center justify-center text-center">
          <p className="text-[13px] text-slate-500">
            Nothing here yet -- once StaffAnchor staffs you on a mandate, it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {mandates.map((m) => (
            <Link
              key={m.mandate_id}
              href={`/vendor/mandates/${m.mandate_id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-teal-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-teal-600">
                  <Briefcase className="w-3.5 h-3.5" />
                  {m.status}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
              </div>
              <h2 className="text-[15px] font-semibold text-slate-900">{m.role_title}</h2>
              <p className="text-[13px] text-slate-500 mt-0.5">{m.client_display}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[12px] text-slate-500">
                {m.cities && m.cities.length > 0 && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {m.cities.join(", ")}
                  </span>
                )}
                {(m.experience_min || m.experience_max) && (
                  <span>
                    {m.experience_min ?? 0}-{m.experience_max ?? "+"} yrs
                  </span>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[12px] text-slate-500">
                  {m.my_submission_count} candidate{m.my_submission_count === 1 ? "" : "s"} submitted by you
                </span>
                <span className="text-[12px] font-medium text-teal-600">View & submit</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
