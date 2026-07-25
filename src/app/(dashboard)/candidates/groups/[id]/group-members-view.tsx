"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  current_employer: string | null;
  status: string | null;
  candidate_number: number | null;
  addedAt: string;
};

export default function GroupMembersView({ groupId, members }: { groupId: string; members: Member[] }) {
  const router = useRouter();
  const supabase = createClient();

  async function removeMember(candidateId: string) {
    const { error } = await supabase
      .from("candidate_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("candidate_id", candidateId);
    if (error) {
      window.alert(`Couldn't remove: ${error.message}`);
      return;
    }
    router.refresh();
  }

  if (members.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg p-8 text-center">
        <Users className="w-6 h-6 text-slate-300 mx-auto mb-2" />
        <p className="text-[13px] text-slate-500">
          No candidates in this group yet. Add some from the{" "}
          <Link href="/candidates" className="text-blue-600 underline">
            Candidates table
          </Link>{" "}
          -- select rows, then choose &quot;Add to group.&quot;
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg shadow-ros-sm overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Email</th>
            <th className="text-left px-3 py-2.5">Mobile</th>
            <th className="text-left px-3 py-2.5">Current employer</th>
            <th className="text-left px-3 py-2.5">Status</th>
            <th className="text-left px-3 py-2.5">Added</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70">
              <td className="px-4 py-2.5">
                <Link href={`/candidates/${m.id}`} className="font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600">
                  {m.full_name || "Unnamed"}
                </Link>
                {m.candidate_number ? <span className="text-slate-400 text-[11px] ml-1">#{m.candidate_number}</span> : null}
              </td>
              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{m.email}</td>
              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{m.phone ?? "—"}</td>
              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{m.current_employer ?? "—"}</td>
              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{m.status ?? "—"}</td>
              <td className="px-3 py-2.5 text-slate-400 text-[12px]">{new Date(m.addedAt).toLocaleDateString()}</td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  className="text-slate-300 hover:text-rose-600"
                  title="Remove from group"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
