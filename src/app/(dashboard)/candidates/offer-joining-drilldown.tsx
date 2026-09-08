"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";

type OfferJoiningRow = { candidateId: string; candidateName: string; roleTitle: string; clientName: string };

const TILE_TONE_CLASSES = {
  warning: "border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
  success: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
} as const;

// Replaces plain Link-based MiniStat tiles for the "Offer & Joining"
// section with buttons that open a same-page modal listing the actual
// candidates -- these tiles are usually a handful of people, so a full
// page navigation into the filtered Candidates list (a full reload of
// every KPI/query on that page) was a lot of round trip just to see who
// they are. Candidate names inside the modal still link through to the
// full profile for anyone who wants more.
export default function OfferJoiningDrilldown({
  offerRows,
  joinedRows,
  offeredNotJoinedRows,
}: {
  offerRows: OfferJoiningRow[];
  joinedRows: OfferJoiningRow[];
  offeredNotJoinedRows: OfferJoiningRow[];
}) {
  const [open, setOpen] = useState<"offer" | "joined" | "not_joined" | null>(null);

  const tiles: {
    key: "offer" | "joined" | "not_joined";
    value: number;
    label: string;
    tone: keyof typeof TILE_TONE_CLASSES;
    rows: OfferJoiningRow[];
    title?: string;
  }[] = [
    { key: "offer", value: offerRows.length, label: "Client Offers", tone: "warning", rows: offerRows },
    { key: "joined", value: joinedRows.length, label: "Joined", tone: "success", rows: joinedRows },
    {
      key: "not_joined",
      value: offeredNotJoinedRows.length,
      label: "Offered, Not Joined",
      tone: "warning",
      rows: offeredNotJoinedRows,
      title: "Placed (or pulled back after an offer/placement) with no confirmed join",
    },
  ];

  const activeTile = tiles.find((t) => t.key === open) ?? null;

  return (
    <>
      {tiles.map((t) => {
        const isZero = t.value === 0;
        return (
          <button
            key={t.key}
            type="button"
            title={t.title}
            disabled={isZero}
            onClick={() => setOpen(t.key)}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-all duration-200 ease-ros",
              TILE_TONE_CLASSES[t.tone],
              isZero ? "opacity-60 cursor-default" : "hover:-translate-y-px hover:opacity-100 active:translate-y-0 active:scale-[0.98] cursor-pointer hover:shadow-ros-sm",
            ].join(" ")}
          >
            <span className="font-semibold tabular-nums">{t.value}</span>
            <span className="opacity-80">{t.label}</span>
          </button>
        );
      })}

      <Dialog open={activeTile !== null} onClose={() => setOpen(null)} title={activeTile?.label} widthClassName="max-w-lg">
        {activeTile && (
          <div className="max-h-[60vh] overflow-y-auto">
            {activeTile.rows.length === 0 ? (
              <p className="text-[13px] text-slate-400">No candidates in this bucket.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500 dark:text-slate-400 text-[10.5px] uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="text-left pb-2">Candidate</th>
                    <th className="text-left pb-2">Client</th>
                    <th className="text-left pb-2">Mandate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeTile.rows.map((r, i) => (
                    <tr key={`${r.candidateId}-${i}`}>
                      <td className="py-2 pr-2">
                        <Link
                          href={`/candidates/${r.candidateId}`}
                          className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {r.candidateName}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-slate-600 dark:text-slate-400">{r.clientName}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">{r.roleTitle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
