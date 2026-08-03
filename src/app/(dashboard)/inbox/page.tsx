import { createClient } from "@/lib/supabase/server";
import InboxView, { type InboxItem } from "./inbox-view";
import MyPerformanceCard from "./my-performance-card";

// Server component: fetches the whole team's open Priority Actions via the
// get_my_inbox() RPC (every staff member sees every task; the UI filters by
// recruiter/assignee client-side) and hands the data to the client-rendered
// inbox UI. Also fetches the recruiter/admin roster once here (same shape
// as MandateStaffingControl's allProfiles fetch on the mandate page) so the
// per-item "assign to" dropdown doesn't need its own round-trip. No writes
// happen here.
export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("get_my_inbox");
  const { data: recruiters } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["admin", "recruiter", "partner"])
    .order("full_name");
  const { data: scorecard } = (await supabase.rpc("get_my_recruiter_scorecard").maybeSingle()) as {
    data: {
      linked: number;
      submitted: number;
      interviewed: number;
      offered: number;
      placed: number;
      candidates_added_week: number;
      candidates_added_total: number;
      profiles_completed: number;
    } | null;
  };

  // Whether the recruiter is staffed on any currently-open mandate --
  // drives which of the three inbox boxes opens by default (Mandate Tasks
  // vs. Build Pipeline). See inbox-view.tsx's BOX_META/activeBox.
  let hasActiveMandates = true;
  if (user) {
    const { data: myAssignments } = await supabase
      .from("mandate_assignments")
      .select("mandate_id, mandates!inner(status)")
      .eq("freelancer_id", user.id)
      .eq("mandates.status", "open");
    hasActiveMandates = !!myAssignments && myAssignments.length > 0;
  }

  const items: InboxItem[] = (error ? [] : data ?? []) as InboxItem[];

  return (
    <InboxView
      initialItems={items}
      fetchError={error?.message ?? null}
      recruiters={recruiters ?? []}
      currentUserId={user?.id ?? null}
      hasActiveMandates={hasActiveMandates}
      performanceCard={
        scorecard ? (
          <MyPerformanceCard
            linked={Number(scorecard.linked ?? 0)}
            submitted={Number(scorecard.submitted ?? 0)}
            interviewed={Number(scorecard.interviewed ?? 0)}
            offered={Number(scorecard.offered ?? 0)}
            placed={Number(scorecard.placed ?? 0)}
            candidatesAddedWeek={Number(scorecard.candidates_added_week ?? 0)}
            candidatesAddedTotal={Number(scorecard.candidates_added_total ?? 0)}
            profilesCompleted={Number(scorecard.profiles_completed ?? 0)}
          />
        ) : null
      }
    />
  );
}
