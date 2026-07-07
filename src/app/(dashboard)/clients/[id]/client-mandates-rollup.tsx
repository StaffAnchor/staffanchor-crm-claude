import Link from "next/link";
import { Users, MapPin } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  on_hold: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  closed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  filled: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
};

export type ClientMandateRow = {
  id: string;
  role_title: string;
  status: string;
  city: string | null;
  linked: number;
  shortlisted: number;
};

export default function ClientMandatesRollup({ rows }: { rows: ClientMandateRow[] }) {
  const open = rows.filter((r) => r.status === "open").length;
  const filled = rows.filter((r) => r.status === "filled").length;
  const totalShortlisted = rows.reduce((sum, r) => sum + r.shortlisted, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Mandates</h2>
        <div className="flex gap-2 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">{rows.length} total</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">{open} open</span>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-700">{filled} filled</span>
          <span className="rounded-full bg-teal-100 px-2.5 py-1 font-medium text-teal-700">
            {totalShortlisted} shortlisted
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-400">No mandates raised for this client yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((m) => (
            <Link
              key={m.id}
              href={`/mandates/${m.id}`}
              className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/70 -mx-2 px-2 rounded-lg transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{m.role_title}</p>
                <div className="flex items-center gap-3 text-[12px] text-slate-500 mt-0.5">
                  {m.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {m.city}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {m.linked} linked · {m.shortlisted} shortlisted
                  </span>
                </div>
              </div>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                  STATUS_STYLE[m.status] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {m.status.replace("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
