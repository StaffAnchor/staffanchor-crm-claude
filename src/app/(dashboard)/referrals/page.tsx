import Link from "next/link";
import { Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ReferralRowActions from "./referral-row-actions";

const STATUS_LABEL: Record<string, string> = {
  referred: "Referred",
  registered: "Registered",
  submitted: "Submitted to a client",
  interviewing: "Interviewing",
  placed: "Placed — payout pending",
  paid: "Paid out",
  not_selected: "Not selected",
};

const STATUS_STYLE: Record<string, string> = {
  referred: "bg-slate-100 text-slate-600",
  registered: "bg-blue-100 text-blue-700",
  submitted: "bg-indigo-100 text-indigo-700",
  interviewing: "bg-cyan-100 text-cyan-700",
  placed: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  not_selected: "bg-red-100 text-red-600",
};

export default async function ReferralsPage() {
  const supabase = await createClient();

  const { data: referrals } = await supabase
    .from("referrals")
    .select(
      `id, referred_name, referred_email, referred_phone, note, status, reward_amount, created_at, placed_at, paid_at,
      referrer:candidates!referrals_referrer_candidate_id_fkey(id, full_name, email),
      referred:candidates!referrals_referred_candidate_id_fkey(id, full_name, status),
      referral_mandates(mandates(id, role_title, status))`
    )
    .order("created_at", { ascending: false });

  type ReferralRow = {
    id: string;
    referred_name: string;
    referred_email: string;
    referred_phone: string | null;
    note: string | null;
    status: string;
    reward_amount: number | null;
    created_at: string;
    placed_at: string | null;
    paid_at: string | null;
    referrer: { id: string; full_name: string | null; email: string | null } | { id: string; full_name: string | null; email: string | null }[] | null;
    referred: { id: string; full_name: string | null; status: string } | { id: string; full_name: string | null; status: string }[] | null;
    referral_mandates: { mandates: { id: string; role_title: string; status: string } | { id: string; role_title: string; status: string }[] | null }[] | null;
  };

  const rows = (referrals ?? []) as unknown as ReferralRow[];
  const totalPaid = rows
    .filter((r) => r.status === "paid" && r.reward_amount)
    .reduce((sum, r) => sum + Number(r.reward_amount), 0);
  const activeCount = rows.filter((r) => !["not_selected"].includes(r.status)).length;
  const pendingPayout = rows.filter((r) => r.status === "placed").length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Referrals</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            Candidates referring candidates — refer & earn up to ₹10,000 per placement retained 90 days.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{rows.length}</p>
          <p className="text-[11px] text-slate-500">Total referrals</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-lg font-semibold text-amber-600 tabular-nums">{pendingPayout}</p>
          <p className="text-[11px] text-slate-500">Placed — payout pending</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-lg font-semibold text-emerald-600 tabular-nums">₹{totalPaid.toLocaleString("en-IN")}</p>
          <p className="text-[11px] text-slate-500">Paid out to date</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <Gift className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No referrals yet — candidates can refer people from their portal.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Referred by</th>
                <th className="text-left px-4 py-2.5">Referred candidate</th>
                <th className="text-left px-4 py-2.5">Role(s) referred for</th>
                <th className="text-left px-4 py-2.5">Contact</th>
                <th className="text-left px-4 py-2.5">Status & reward</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const referrer = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
                const referred = Array.isArray(r.referred) ? r.referred[0] : r.referred;
                const mandates = (r.referral_mandates ?? [])
                  .map((rm) => (Array.isArray(rm.mandates) ? rm.mandates[0] : rm.mandates))
                  .filter((m): m is { id: string; role_title: string; status: string } => !!m);
                return (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3">
                      {referrer ? (
                        <Link href={`/candidates/${referrer.id}`} className="text-blue-600 hover:underline font-medium">
                          {referrer.full_name || referrer.email}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{r.referred_name}</p>
                      {referred ? (
                        <Link href={`/candidates/${referred.id}`} className="text-xs text-blue-600 hover:underline">
                          View profile ({referred.status})
                        </Link>
                      ) : (
                        <p className="text-xs text-slate-400">Not registered yet</p>
                      )}
                      {r.note && <p className="text-xs text-slate-400 mt-0.5 max-w-xs">{r.note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {mandates.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="space-y-1">
                          {mandates.map((m) => (
                            <Link
                              key={m.id}
                              href={`/mandates/${m.id}`}
                              className="block text-xs text-blue-600 hover:underline"
                            >
                              {m.role_title}
                              {m.status !== "open" && (
                                <span className="ml-1 text-slate-400">({m.status.replace("_", " ")})</span>
                              )}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{r.referred_email}</p>
                      {r.referred_phone && <p className="text-xs text-slate-400">{r.referred_phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <ReferralRowActions referralId={r.id} currentStatus={r.status} currentReward={r.reward_amount} />
                      <span
                        className={`inline-block mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
