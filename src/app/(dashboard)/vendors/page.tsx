import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InviteAgencyForm from "./invite-agency-form";
import AssignAgencyControl from "./assign-agency-control";

// The vendor directory: turns "vendor" from an implicit profiles.role value
// into a real, manageable company-level relationship. Admin-only, same gate
// as /team -- this is where you invite a new agency (self-serve signup for
// their first recruiter, see api/vendor-agencies/invite) and assign any
// legacy freelancer accounts (created the old manual way, before
// vendor_agencies existed) to the agency they actually belong to.
export default async function VendorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "admin") redirect("/candidates");

  const { data: agencies } = await supabase
    .from("vendor_agencies")
    .select("id, name, contact_name, contact_email, status, invited_at, activated_at")
    .order("created_at", { ascending: false });

  const { data: freelancerProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, vendor_agency_id")
    .eq("role", "freelancer")
    .order("full_name", { ascending: true });

  // Aggregate submitted/placed/rejected per agency -- the closest thing to a
  // vendor scorecard the admin side has ever had (previously only a generic,
  // vendor/recruiter-conflated "Recruiter Performance" report tab existed).
  const { data: scorecards } = await supabase.rpc("get_vendor_agency_scorecards");
  const scorecardByAgency = new Map(
    ((scorecards ?? []) as { agency_id: string; total_submitted: number; placed: number; rejected: number }[]).map(
      (s) => [s.agency_id, s]
    )
  );

  const recruitersByAgency = new Map<string, { id: string; full_name: string; email: string }[]>();
  const unassigned: { id: string; full_name: string; email: string }[] = [];
  for (const p of freelancerProfiles ?? []) {
    if (p.vendor_agency_id) {
      const list = recruitersByAgency.get(p.vendor_agency_id) ?? [];
      list.push(p);
      recruitersByAgency.set(p.vendor_agency_id, list);
    } else {
      unassigned.push(p);
    }
  }

  const statusTone: Record<string, string> = {
    invited: "bg-amber-50 text-amber-700",
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-8 grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <div>
          <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">Vendor agencies</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            External staffing partners who submit candidates through the vendor portal, managed as companies rather
            than loose individual accounts.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Agency</th>
                <th className="text-left px-4 py-2.5">Contact</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Recruiters</th>
                <th className="text-left px-4 py-2.5">Submitted / Placed / Rejected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(agencies ?? []).map((a) => {
                const sc = scorecardByAgency.get(a.id);
                return (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{a.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {a.contact_name ? `${a.contact_name} · ` : ""}
                      {a.contact_email}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusTone[a.status] ?? ""}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {(recruitersByAgency.get(a.id) ?? []).map((r) => r.full_name).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">
                      {sc ? `${sc.total_submitted} / ${sc.placed} / ${sc.rejected}` : "—"}
                    </td>
                  </tr>
                );
              })}
              {(agencies ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    No vendor agencies invited yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {unassigned.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Legacy vendor accounts without an agency
            </h2>
            <p className="text-[12px] text-slate-400 mb-3">
              Created before agency tracking existed — assign each to the agency they actually belong to.
            </p>
            <div className="space-y-2">
              {unassigned.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2"
                >
                  <div className="text-[13px]">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{p.full_name}</span>
                    <span className="text-slate-400 ml-1.5">{p.email}</span>
                  </div>
                  <AssignAgencyControl profileId={p.id} agencies={agencies ?? []} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Invite a vendor agency</h2>
          <p className="text-[12px] text-slate-400 mb-3">
            Sends a self-serve signup link — no more manually generating and handing off a password.
          </p>
          <InviteAgencyForm />
        </div>
      </div>
    </div>
  );
}
