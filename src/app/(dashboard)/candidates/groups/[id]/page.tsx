import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GroupMembersView from "./group-members-view";

export default async function CandidateGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase.from("candidate_groups").select("id, name, description").eq("id", id).single();
  if (!group) notFound();

  // Same core fields the main Candidates table shows/filters on -- a saved
  // group is meant to be a working shortlist, not just a name/email list, so
  // it needs enough context (CTC, experience, location, notice, etc.) to
  // actually compare candidates without clicking into each profile.
  const { data: members } = await supabase
    .from("candidate_group_members")
    .select(
      "candidate_id, added_at, candidates:candidate_id(id, full_name, email, phone, current_employer, status, candidate_number, current_location, current_fixed_ctc, total_experience_years, notice_period, current_industry, sub_domain, open_to_relocation)"
    )
    .eq("group_id", id)
    .order("added_at", { ascending: false });

  const rows = (members ?? [])
    .map((m) => {
      const c = m.candidates as unknown as {
        id: string;
        full_name: string;
        email: string;
        phone: string | null;
        current_employer: string | null;
        status: string | null;
        candidate_number: number | null;
        current_location: string | null;
        current_fixed_ctc: number | null;
        total_experience_years: number | null;
        notice_period: string | null;
        current_industry: string | null;
        sub_domain: string | null;
        open_to_relocation: string | null;
      } | null;
      if (!c) return null;
      return { ...c, addedAt: m.added_at as string };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div>
      <Link href="/candidates/groups" className="text-[12px] text-slate-400 hover:text-slate-600 mb-1 inline-block">
        ← Back to Groups
      </Link>
      <div className="mb-3">
        <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{group.name}</h1>
        {group.description && <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">{group.description}</p>}
      </div>
      <GroupMembersView groupId={group.id} members={rows} />
    </div>
  );
}
