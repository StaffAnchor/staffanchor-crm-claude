import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const SENIORITY_LABEL: Record<string, string> = {
  ic: "IC",
  team_lead: "Team Lead",
  manager: "Manager",
  director: "Director",
  vp_plus: "VP & above",
};

// The point of the practice structure (see candidate_practices /
// recruiter_practices / mandates.practice_id): a recruiter should be able to
// pitch ONE candidate to every open mandate that shares their practice and
// seniority band, not just the mandate that candidate first came in on.
// This view is that cross-reference -- "everyone I own, matched against
// every open mandate in my practices" -- instead of forcing the recruiter
// to check mandate-by-mandate.
export default async function PracticePoolPage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; practice?: string }>;
}) {
  const { band, practice: practiceFilter } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";

  const { data: ownedRows } = await supabase.from("recruiter_practices").select("practice_id").eq("user_id", user.id);
  const ownedPracticeIds = (ownedRows ?? []).map((r) => r.practice_id);

  const { data: allPractices } = await supabase
    .from("practices")
    .select("id, name, group_name")
    .order("sort_order", { ascending: true });

  // Admins can see any practice's pool (for oversight); recruiters only see
  // practices they own.
  const visiblePracticeIds = isAdmin ? (allPractices ?? []).map((p) => p.id) : ownedPracticeIds;

  if (visiblePracticeIds.length === 0) {
    return (
      <div className="max-w-[1500px] mx-auto px-5 py-8">
        <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">
          My Practice Pool
        </h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-6">
          Every candidate you own tagged into a practice, cross-referenced against every open mandate in that
          practice -- so the same candidate can be pitched to every client that needs a similar profile.
        </p>
        <EmptyState
          title="No practices assigned yet"
          description="Ask an admin to tag you into at least one practice on the Team page before this pool can populate."
        />
      </div>
    );
  }

  const practiceMap = new Map((allPractices ?? []).map((p) => [p.id, p]));

  const { data: candidatePracticeRows } = await supabase
    .from("candidate_practices")
    .select("candidate_id, practice_id, seniority_band, is_primary, candidates(id, full_name, current_job_title, current_location, status, owner_id)")
    .in("practice_id", visiblePracticeIds);

  const { data: openMandates } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, practice_id, seniority_band")
    .in("practice_id", visiblePracticeIds)
    .eq("status", "open")
    .eq("is_archived", false);

  type CandidateRow = {
    candidate_id: string;
    practice_id: string;
    seniority_band: string;
    is_primary: boolean;
    candidates: { id: string; full_name: string; current_job_title: string | null; current_location: string | null; status: string; owner_id: string | null } | null;
  };
  type MandateRow = { id: string; role_title: string; client_name: string; practice_id: string; seniority_band: string | null };

  const rows = (candidatePracticeRows ?? []) as unknown as CandidateRow[];
  const mandates = (openMandates ?? []) as unknown as MandateRow[];

  const filteredRows = rows.filter((r) => {
    if (band && r.seniority_band !== band) return false;
    if (practiceFilter && r.practice_id !== practiceFilter) return false;
    return true;
  });

  function matchingMandates(practiceId: string, seniorityBand: string) {
    return mandates.filter((m) => m.practice_id === practiceId && (m.seniority_band === seniorityBand || !m.seniority_band));
  }

  const bandOptions = Object.entries(SENIORITY_LABEL);
  const visiblePractices = (allPractices ?? []).filter((p) => visiblePracticeIds.includes(p.id));

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">
        My Practice Pool
      </h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-6">
        Every candidate tagged into {isAdmin ? "a" : "your"} practice, cross-referenced against every open mandate in
        that practice -- so the same candidate can be pitched to every client that needs a similar profile, not just
        the one mandate they first came in on.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        <Link
          href="/practice-pool"
          className={`text-[12px] px-2.5 py-1 rounded-full border ${!practiceFilter ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"}`}
        >
          All practices
        </Link>
        {visiblePractices.map((p) => (
          <Link
            key={p.id}
            href={`/practice-pool?practice=${p.id}${band ? `&band=${band}` : ""}`}
            className={`text-[12px] px-2.5 py-1 rounded-full border ${practiceFilter === p.id ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"}`}
          >
            {p.name}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href={`/practice-pool${practiceFilter ? `?practice=${practiceFilter}` : ""}`}
          className={`text-[11px] px-2 py-0.5 rounded-full border ${!band ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900" : "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400"}`}
        >
          All bands
        </Link>
        {bandOptions.map(([value, label]) => (
          <Link
            key={value}
            href={`/practice-pool?band=${value}${practiceFilter ? `&practice=${practiceFilter}` : ""}`}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${band === value ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900" : "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No candidates in this pool yet" description="Tag candidates into this practice from their profile page." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="text-left px-3 py-2.5">Candidate</th>
                <th className="text-left px-3 py-2.5">Practice</th>
                <th className="text-left px-3 py-2.5">Seniority</th>
                <th className="text-left px-3 py-2.5">Current role</th>
                <th className="text-left px-3 py-2.5">Open mandates in this practice+band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.map((r) => {
                const cand = r.candidates;
                if (!cand) return null;
                const practice = practiceMap.get(r.practice_id);
                const matches = matchingMandates(r.practice_id, r.seniority_band);
                return (
                  <tr key={`${r.candidate_id}-${r.practice_id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2.5">
                      <Link href={`/candidates/${cand.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:underline">
                        {cand.full_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                      {practice?.name ?? "—"}
                      {r.is_primary && <Badge tone="accent" size="sm" className="ml-1.5">Primary</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{SENIORITY_LABEL[r.seniority_band] ?? r.seniority_band}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{cand.current_job_title ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {matches.length === 0 ? (
                        <span className="text-slate-400">No open mandates right now</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {matches.map((m) => (
                            <Link
                              key={m.id}
                              href={`/mandates/${m.id}?tab=candidates`}
                              className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                            >
                              {m.role_title} — {m.client_name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
