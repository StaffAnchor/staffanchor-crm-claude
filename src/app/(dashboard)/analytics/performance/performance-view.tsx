"use client";

import { useMemo, useState } from "react";

export type RevenueRow = {
  source: "historical" | "live";
  clientId: string;
  clientName: string;
  date: string; // ISO
  gross: number;
  net: number;
  status: string;
};

const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function fyLabel(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function monthLabel(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  return { key, label };
}

type Tab = "client" | "month" | "fy";

export default function PerformanceView({ rows }: { rows: RevenueRow[] }) {
  const [tab, setTab] = useState<Tab>("client");
  const [clientFilter, setClientFilter] = useState<string | null>(null);

  const filtered = clientFilter ? rows.filter((r) => r.clientId === clientFilter) : rows;

  const totalGross = filtered.reduce((a, r) => a + r.gross, 0);
  const totalNet = filtered.reduce((a, r) => a + r.net, 0);

  const byClient = useMemo(() => {
    const map = new Map<string, { clientId: string; clientName: string; gross: number; net: number; count: number; lastDate: string }>();
    for (const r of rows) {
      const existing = map.get(r.clientId);
      if (existing) {
        existing.gross += r.gross;
        existing.net += r.net;
        existing.count += 1;
        if (r.date > existing.lastDate) existing.lastDate = r.date;
      } else {
        map.set(r.clientId, { clientId: r.clientId, clientName: r.clientName, gross: r.gross, net: r.net, count: 1, lastDate: r.date });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
  }, [rows]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { key: string; label: string; gross: number; net: number; count: number }>();
    for (const r of filtered) {
      const { key, label } = monthLabel(r.date);
      const existing = map.get(key);
      if (existing) {
        existing.gross += r.gross;
        existing.net += r.net;
        existing.count += 1;
      } else {
        map.set(key, { key, label, gross: r.gross, net: r.net, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [filtered]);

  const byFy = useMemo(() => {
    const map = new Map<string, { fy: string; gross: number; net: number; count: number }>();
    for (const r of filtered) {
      const fy = fyLabel(r.date);
      const existing = map.get(fy);
      if (existing) {
        existing.gross += r.gross;
        existing.net += r.net;
        existing.count += 1;
      } else {
        map.set(fy, { fy, gross: r.gross, net: r.net, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.fy < b.fy ? -1 : 1));
  }, [filtered]);

  const filteredClientName = clientFilter ? rows.find((r) => r.clientId === clientFilter)?.clientName : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total (incl. GST)" value={fmt(totalGross)} />
        <StatCard label="Net (excl. GST)" value={fmt(totalNet)} />
        <StatCard label="Invoices / tranches" value={String(filtered.length)} />
        <StatCard label="Clients billed" value={String(new Set(filtered.map((r) => r.clientId)).size)} />
      </div>

      {clientFilter && (
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="text-slate-500 dark:text-slate-400">Filtered to</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">{filteredClientName}</span>
          <button onClick={() => setClientFilter(null)} className="text-blue-600 hover:underline">
            Clear
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {(["client", "month", "fy"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[12.5px] font-medium px-3 py-2 -mb-px border-b-2 transition-colors ${
              tab === t
                ? "border-teal-600 text-slate-900 dark:text-slate-100"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t === "client" ? "Client-wise" : t === "month" ? "Month-wise" : "FY-wise"}
          </button>
        ))}
      </div>

      {tab === "client" && (
        <Table
          head={["Client", "Invoices", "Gross (incl. GST)", "Net", "Last billed"]}
          rows={byClient.map((c) => [
            <button key="name" onClick={() => setClientFilter(c.clientId)} className="text-left text-blue-600 hover:underline">
              {c.clientName}
            </button>,
            String(c.count),
            fmt(c.gross),
            fmt(c.net),
            new Date(c.lastDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          ])}
        />
      )}

      {tab === "month" && (
        <Table
          head={["Month", "Invoices", "Gross (incl. GST)", "Net"]}
          rows={byMonth.map((m) => [m.label, String(m.count), fmt(m.gross), fmt(m.net)])}
        />
      )}

      {tab === "fy" && (
        <Table head={["FY", "Invoices", "Gross (incl. GST)", "Net"]} rows={byFy.map((f) => [f.fy, String(f.count), fmt(f.gross), fmt(f.net)])} />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-[16px] font-bold text-slate-900 dark:text-slate-100 mt-0.5">{value}</p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">No billed revenue on file yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
            {head.map((h) => (
              <th key={h} className="py-2 pr-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j === 0 ? "text-slate-800 dark:text-slate-200" : "text-slate-600 dark:text-slate-400 tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
