import { billingLine, type DroppedRow } from "@/lib/placements/drops";
import { shortDate } from "@/lib/anchor/data";
import DroppedActions from "./dropped-actions";

const TONE = { ok: "text-emerald-700 dark:text-emerald-300", warn: "text-amber-700 dark:text-amber-300", bad: "text-rose-700 dark:text-rose-300" };

// Placements that fell through inside the 90-day guarantee, with what happened to the fee. Fee amounts and actions are admin only.
export default function DroppedSection({ rows, isAdmin }: { rows: DroppedRow[]; isAdmin: boolean }) {
  const needs = rows.filter((r) => r.billingLive || r.fees.some((f) => f.refundDue && !f.refundSettledAt) || r.stage === "placed");
  return (
    <section className="mt-6 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="px-4 pb-2 pt-4">
        <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Dropped within 90 days <span className="text-slate-400">{rows.length}</span></h2>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          Placed, then left or never joined inside the guarantee. Their billing is cancelled, paid or not.{isAdmin && needs.length > 0 ? ` ${needs.length} need${needs.length === 1 ? "s" : ""} an action.` : ""}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-5 text-[14px] text-slate-500 dark:border-slate-800">Nobody has dropped. Good.</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const b = billingLine(r, isAdmin);
            return (
              <li key={r.linkId} className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <a href={`/candidates/${r.candidateId}`} target="_blank" rel="noopener noreferrer" className="text-[15px] font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">{r.candidate}</a>
                  <span className="text-[13px] text-slate-500">{r.kind === "did_not_join" ? "Never joined" : r.kind === "attrited" ? "Left (check-in)" : "Dropped"} {r.droppedOn ? shortDate(r.droppedOn) : ""}{r.daysIn !== null && r.daysIn >= 0 ? ` · day ${r.daysIn}` : ""}</span>
                </div>
                <a href={`/mandates/${r.mandateId}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] text-slate-500 hover:text-teal-700">{r.client} · {r.role}{r.joined ? ` · joined ${shortDate(r.joined)}` : ""}</a>
                <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">{r.reason}</p>
                <p className={`mt-0.5 text-[13px] font-medium ${TONE[b.tone]}`}>{b.text}</p>
                {isAdmin && r.fees.some((f) => f.invoiceEmailedAt) && r.billingLive === false && (
                  <p className="text-[12px] text-slate-500">An invoice ({r.fees.find((f) => f.invoiceEmailedAt)?.invoiceNumber ?? "invoice"}) was already emailed to the client. Let them know it is cancelled.</p>
                )}
                {isAdmin && (
                  <div className="mt-2">
                    <DroppedActions row={{ linkId: r.linkId, candidate: r.candidate, client: r.client, joined: r.joined, droppedOn: r.droppedOn, stage: r.stage, recorded: r.recorded, billingLive: r.billingLive, refunds: r.fees.filter((f) => f.refundDue && !f.refundSettledAt).map((f) => ({ feeId: f.id })) }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
