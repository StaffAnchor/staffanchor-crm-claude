import { Card } from "@/components/ui/card";
import { rejectionReasonLabel } from "@/lib/mandate-stage";

export type LearnRow = {
  name: string;
  role: string;
  feedback: string | null;
  reason: string | null;
  note: string | null;
  ourNote: string | null;
  years: number | null;
  expectedPay: number | null;
  at: string | null;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const plain = (code: string) => (rejectionReasonLabel("client_relayed", code) ?? code).replace(/^Client:?\s*/i, "").replace(/^cited /i, "");

// What this employer has told us through the portal, in one place: why they pass, what they like, and the comments on both
// sides. It is the same information the matching and the recruiter's call prep should lean on for this client.
export default function ClientLearningsPanel({ rows }: { rows: LearnRow[] }) {
  const passed = rows.filter((r) => r.feedback === "not_interested");
  const liked = rows.filter((r) => r.feedback === "interested" || r.feedback === "interview_requested");
  if (passed.length === 0 && liked.length === 0) return null;

  const reasons = new Map<string, number>();
  for (const r of passed) if (r.reason) reasons.set(plain(r.reason), (reasons.get(plain(r.reason)) ?? 0) + 1);
  const top = Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]);

  const yearsPass = avg(passed.map((r) => r.years).filter((x): x is number => x != null));
  const yearsLike = avg(liked.map((r) => r.years).filter((x): x is number => x != null));
  const payPass = avg(passed.map((r) => r.expectedPay).filter((x): x is number => x != null));
  const payLike = avg(liked.map((r) => r.expectedPay).filter((x): x is number => x != null));
  const comments = rows.filter((r) => r.note || r.ourNote).slice(0, 8);
  const fmt = (n: number | null, unit: string) => (n == null ? "–" : `${Math.round(n * 10) / 10}${unit}`);

  return (
    <Card className="mt-5">
      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">What this client has told us</h2>
      <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
        From {passed.length} pass{passed.length === 1 ? "" : "es"} and {liked.length} show{liked.length === 1 ? "" : "s"} of interest in the portal. Use it before you shortlist the next person for them.
      </p>

      {top.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">Why they pass</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {top.map(([label, n]) => (
              <span key={label} className="rounded-full bg-rose-50 px-2.5 py-1 text-[12.5px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                {label} · {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {liked.length > 0 && passed.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-[13px] dark:border-emerald-900 dark:bg-emerald-950/10">
            <p className="font-medium text-emerald-800 dark:text-emerald-300">Liked ({liked.length})</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">Average {fmt(yearsLike, " yrs")} experience, expecting {fmt(payLike, "L")}.</p>
            <p className="mt-0.5 text-slate-500">{liked.map((r) => r.name).join(", ")}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-[13px] dark:border-rose-900 dark:bg-rose-950/10">
            <p className="font-medium text-rose-800 dark:text-rose-300">Passed ({passed.length})</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">Average {fmt(yearsPass, " yrs")} experience, expecting {fmt(payPass, "L")}.</p>
            <p className="mt-0.5 text-slate-500">{passed.map((r) => r.name).join(", ")}</p>
          </div>
        </div>
      )}

      {comments.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">Comments</p>
          <ul className="mt-1.5 space-y-2">
            {comments.map((r, i) => (
              <li key={i} className="text-[13px] text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-slate-100">{r.name}</span> <span className="text-slate-400">· {r.role}</span>
                {r.note && <p className="text-slate-600 dark:text-slate-300">Client: {r.note}</p>}
                {r.ourNote && <p className="text-amber-800 dark:text-amber-300">Our note: {r.ourNote}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
