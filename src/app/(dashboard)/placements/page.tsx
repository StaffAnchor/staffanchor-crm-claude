import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PlacementsView, { type PlacementRow } from "./placements-view";

// Source-of-truth placement tracker: every candidate at stage="placed",
// their joining date, and the recruiter's confirmation of what actually
// happened on/around that date (joined on time / joined but postponed /
// did not join). Billing (Offered CTC x client fee % + 18% GST) is
// computed here from the same offered_fixed_ctc + clients.fee_percentage
// that fn_create_fee_tranches() (see migration) uses to generate the
// actual fee-tranche rows on the Billing page -- this table is a faster,
// flatter read of "who's placed and what are we owed", not a replacement
// for the tranche-level invoicing workflow.
//
// Visible to every recruiter (not admin-gated like the rest of Analytics)
// since DOJ + join confirmation is something any recruiter working a
// placement needs to update. Only the Offered CTC / billing figures are
// admin-editable (enforced via the admin_set_offered_ctc() RPC, not just
// hidden in the UI, since RLS otherwise grants any staff full row access).
export default async function PlacementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = myProfile?.role === "admin";

  const { data, error } = await supabase
    .from("candidate_mandate_links")
    .select(
      "id, candidate_id, mandate_id, date_of_joining, offered_fixed_ctc, join_status, join_status_updated_at, stage_updated_at, candidates(full_name, owner_id, expected_fixed_ctc, current_fixed_ctc), mandates(role_title, client_name, client_id, clients(fee_percentage))"
    )
    .eq("stage", "placed")
    .order("date_of_joining", { ascending: false, nullsFirst: false });

  const rows: PlacementRow[] = (error ? [] : data ?? []).map((r) => {
    const candidate = r.candidates as unknown as {
      full_name: string;
      owner_id: string | null;
      expected_fixed_ctc: number | null;
      current_fixed_ctc: number | null;
    } | null;
    const mandate = r.mandates as unknown as {
      role_title: string;
      client_name: string;
      client_id: string | null;
      clients: { fee_percentage: number } | null;
    } | null;
    const fallbackCtc = candidate?.expected_fixed_ctc ?? candidate?.current_fixed_ctc ?? null;
    return {
      linkId: r.id,
      candidateId: r.candidate_id,
      mandateId: r.mandate_id,
      candidateName: candidate?.full_name ?? "Unknown",
      ownerId: candidate?.owner_id ?? null,
      roleTitle: mandate?.role_title ?? "—",
      clientName: mandate?.client_name ?? "—",
      hasClientLink: !!mandate?.client_id,
      feePercentage: mandate?.clients?.fee_percentage ?? null,
      dateOfJoining: r.date_of_joining,
      offeredFixedCtc: r.offered_fixed_ctc,
      fallbackCtc,
      joinStatus: r.join_status,
      joinStatusUpdatedAt: r.join_status_updated_at,
      stageUpdatedAt: r.stage_updated_at,
    };
  });

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">Placements</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-6">
        Every placed candidate, their joining date, and confirmation of what actually happened -- the source of truth
        this updates everywhere else (Candidates, mandate pipelines, Billing).
      </p>
      <PlacementsView initialRows={rows} fetchError={error?.message ?? null} isAdmin={isAdmin} currentUserId={user.id} />
    </div>
  );
}
