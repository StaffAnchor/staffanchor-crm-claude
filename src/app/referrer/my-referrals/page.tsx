import { createClient } from "@/lib/supabase/server";

// Referrer-facing status list. internal_notes is deliberately never
// selected here -- referrers see stage only, never client-internal notes,
// per spec section 4. Every status value in the enum is itself
// referrer-safe by design (the spec lists all of them, including the
// exception states, as things the referrer should see), so no filtering is
// needed beyond just not selecting internal_notes.
const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  screened: "Screened",
  candidate_interested: "Candidate interested",
  submitted_to_client: "Submitted to client",
  interviewing: "Interviewing",
  offered: "Offered",
  joined: "Joined",
  ninety_days_completed: "90 days completed",
  payment_received: "Payment received from client",
  payout_processed: "Payout processed",
  not_suitable: "Not suitable",
  candidate_declined: "Candidate declined",
  dropped_out: "Dropped out",
  left_before_90_days: "Left before 90 days",
};
const STATUS_TONE: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700",
  screened: "bg-blue-100 text-blue-700",
  candidate_interested: "bg-blue-100 text-blue-700",
  submitted_to_client: "bg-indigo-100 text-indigo-700",
  interviewing: "bg-indigo-100 text-indigo-700",
  offered: "bg-amber-100 text-amber-700",
  joined: "bg-emerald-100 text-emerald-700",
  ninety_days_completed: "bg-emerald-100 text-emerald-700",
  payment_received: "bg-emerald-100 text-emerald-700",
  payout_processed: "bg-emerald-100 text-emerald-700",
  not_suitable: "bg-rose-100 text-rose-700",
  candidate_declined: "bg-rose-100 text-rose-700",
  dropped_out: "bg-rose-100 text-rose-700",
  left_before_90_days: "bg-rose-100 text-rose-700",
};

export default async function MyReferralsPage() {
  const supabase = await createClient();
  const { data: referrals } = await supabase
    .from("sales_circle_referrals")
    .select("id, candidate_name, candidate_current_company, status, status_reason, created_at, mandate_id, mandates(role_title, client_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <h1 className="text-xl font-semibold text-slate-900">My Referrals</h1>
      <p className="text-sm text-slate-500 mt-1">Every candidate you&apos;ve referred, and where they are.</p>

      {!referrals || referrals.length === 0 ? (
        <p className="text-sm text-slate-400 mt-8">No referrals yet. Head to Roles or Refer someone to get started.</p>
      ) : (
        <div className="mt-6 divide-y divide-slate-100 bg-white rounded-xl border border-slate-200">
          {referrals.map((r) => {
            const mandate = Array.isArray(r.mandates) ? r.mandates[0] : r.mandates;
            return (
              <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <div className="text-[14px] font-medium text-slate-900">{r.candidate_name}</div>
                  <div className="text-[12px] text-slate-400 mt-0.5">
                    {r.candidate_current_company ? `${r.candidate_current_company} · ` : ""}
                    {mandate ? `for ${mandate.role_title}` : "Bench referral"}
                  </div>
                </div>
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_TONE[r.status] ?? "bg-slate-100 text-slate-700"}`}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
