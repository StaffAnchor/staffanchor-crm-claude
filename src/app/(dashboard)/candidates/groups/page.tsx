import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GroupsView from "./groups-view";

// Saved candidate segments (inspired by Ceipal's "Applicant Groups") --
// a recruiter builds a filtered/selected set once on the main Candidates
// table (via the new "Add to group" bulk action) and can name it here to
// come back to later, instead of re-running the same filter combination
// every time. Each group is just a named bucket of candidate_id rows in
// candidate_group_members -- membership only, no independent data of its
// own, so a candidate can sit in as many groups as make sense.
export default async function CandidateGroupsPage() {
  const supabase = await createClient();

  const { data: groups } = await supabase
    .from("candidate_groups")
    .select("id, name, description, created_at, created_by, profiles:created_by(full_name)")
    .order("created_at", { ascending: false });

  const groupIds = (groups ?? []).map((g) => g.id);
  const counts: Record<string, number> = {};
  if (groupIds.length > 0) {
    const { data: members } = await supabase
      .from("candidate_group_members")
      .select("group_id")
      .in("group_id", groupIds);
    for (const m of members ?? []) {
      counts[m.group_id] = (counts[m.group_id] ?? 0) + 1;
    }
  }

  const rows = (groups ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    description: g.description as string | null,
    createdAt: g.created_at as string,
    createdByName: (g.profiles as { full_name?: string } | null)?.full_name ?? null,
    count: counts[g.id as string] ?? 0,
  }));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <Link href="/candidates" className="text-[12px] text-slate-400 hover:text-slate-600 mb-1 inline-block">
            ← Back to Candidates
          </Link>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Candidate Groups
          </h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            Saved candidate segments you can come back to, instead of re-running the same filters.
          </p>
        </div>
      </div>
      <GroupsView groups={rows} />
    </div>
  );
}
