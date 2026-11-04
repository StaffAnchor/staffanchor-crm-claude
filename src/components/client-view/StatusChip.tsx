import type { BoardCandidate } from "./types";
import { STATUS_NAME, STATUS_TONE, statusDetail, statusOf } from "./status";

// The chip that says where a candidate stands, with a small line beside it (a date, a reason, or what happens next).
export default function StatusChip({ c, className = "" }: { c: BoardCandidate; className?: string }) {
  const s = statusOf(c);
  const detail = statusDetail(c);
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`}>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${STATUS_TONE[s]}`}>{STATUS_NAME[s]}</span>
      {detail && <span className="text-[12px] text-slate-500">{detail}</span>}
    </span>
  );
}
