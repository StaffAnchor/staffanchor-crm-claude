import Link from "next/link";
import { Users, MapPin } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const STATUS_TONE: Record<string, BadgeTone> = {
  open: "success",
  on_hold: "warning",
  closed: "neutral",
  filled: "accent",
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
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Mandates</h2>
        <div className="flex gap-2">
          <Badge tone="neutral" size="sm" className="normal-case tracking-normal">{rows.length} total</Badge>
          <Badge tone="success" size="sm" className="normal-case tracking-normal">{open} open</Badge>
          <Badge tone="accent" size="sm" className="normal-case tracking-normal">{filled} filled</Badge>
          <Badge tone="info" size="sm" className="normal-case tracking-normal">{totalShortlisted} shortlisted</Badge>
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
              className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/70 -mx-2 px-2 rounded-ros-md transition-all duration-200 ease-ros"
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
              <Badge tone={STATUS_TONE[m.status] ?? "neutral"} className="normal-case tracking-normal shrink-0">
                {m.status.replace("_", " ")}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
