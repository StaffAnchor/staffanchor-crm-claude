import { createClient } from "@/lib/supabase/server";
import { friendlyVendorError } from "@/lib/friendly-error";

// Own-performance-only view for a vendor -- previously the only performance
// signal that existed anywhere touching vendors was the internal "Recruiter
// Performance" report tab (admin-only, conflates vendors and internal
// recruiters in one table). A vendor had no way to see their own numbers at
// all. Deliberately no cross-vendor comparison or leaderboard here -- this is
// about a vendor seeing their own conversion, not being ranked against peers
// they can't see the context for.
type Scorecard = {
  total_submitted: number;
  interviewed: number;
  offered: number;
  placed: number;
  rejected: number;
  still_active: number;
};

function StatTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className={`text-[26px] font-semibold ${tone}`}>{value}</p>
      <p className="text-[12px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

export default async function VendorScorecardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_vendor_scorecard").maybeSingle();
  const s = (data ?? {
    total_submitted: 0,
    interviewed: 0,
    offered: 0,
    placed: 0,
    rejected: 0,
    still_active: 0,
  }) as Scorecard;

  const placementRate = s.total_submitted > 0 ? Math.round((s.placed / s.total_submitted) * 100) : 0;
  const interviewRate = s.total_submitted > 0 ? Math.round((s.interviewed / s.total_submitted) * 100) : 0;

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-6">
      <h1 className="text-[20px] font-semibold text-slate-900">My Scorecard</h1>
      <p className="text-[13px] text-slate-500 mt-0.5 mb-5">
        Your own submission-to-placement performance across every mandate you've worked.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {friendlyVendorError(error.message, "scorecard")}
        </div>
      )}

      {s.total_submitted === 0 && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 flex flex-col items-center justify-center text-center">
          <p className="text-[13px] text-slate-500">
            Submit your first candidate from My Mandates to start building your scorecard.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatTile label="Total submitted" value={s.total_submitted} tone="text-slate-900" />
            <StatTile label="Still active" value={s.still_active} tone="text-sky-700" />
            <StatTile label="Reached interview" value={s.interviewed} tone="text-amber-700" />
            <StatTile label="Reached offer" value={s.offered} tone="text-emerald-700" />
            <StatTile label="Placed" value={s.placed} tone="text-emerald-800" />
            <StatTile label="Not moving forward" value={s.rejected} tone="text-rose-700" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[24px] font-semibold text-slate-900">{interviewRate}%</p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Of your submissions reach a client interview — a rough read on how closely your candidates match
                what each mandate actually needs.
              </p>
            </div>
            <div>
              <p className="text-[24px] font-semibold text-slate-900">{placementRate}%</p>
              <p className="text-[12px] text-slate-500 mt-0.5">Of your submissions end in a placement.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
