"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatExperience } from "@/lib/format-experience";

type Member = {
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
  addedAt: string;
};

function uniqueSorted(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

export default function GroupMembersView({ groupId, members }: { groupId: string; members: Member[] }) {
  const router = useRouter();
  const supabase = createClient();

  // Small, fully-loaded lists (a saved group), so filtering is done client-side
  // over the array we already have -- no need for the URL-param/server-query
  // pattern the main Candidates table uses for its much larger, paginated set.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [noticeFilter, setNoticeFilter] = useState("");
  const [relocationFilter, setRelocationFilter] = useState("");
  const [minExp, setMinExp] = useState("");

  const statusOptions = useMemo(() => uniqueSorted(members.map((m) => m.status)), [members]);
  const industryOptions = useMemo(() => uniqueSorted(members.map((m) => m.current_industry)), [members]);
  const noticeOptions = useMemo(() => uniqueSorted(members.map((m) => m.notice_period)), [members]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return members.filter((m) => {
      if (needle) {
        const haystack = `${m.full_name} ${m.email} ${m.phone ?? ""} ${m.current_employer ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (statusFilter && m.status !== statusFilter) return false;
      if (industryFilter && m.current_industry !== industryFilter) return false;
      if (noticeFilter && m.notice_period !== noticeFilter) return false;
      if (relocationFilter && (m.open_to_relocation ?? "") !== relocationFilter) return false;
      if (minExp && (m.total_experience_years ?? 0) < Number(minExp)) return false;
      return true;
    });
  }, [members, search, statusFilter, industryFilter, noticeFilter, relocationFilter, minExp]);

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

  const selectClass =
    "text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, mobile, employer..."
          className="text-[12.5px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-64 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} className={selectClass}>
          <option value="">All industries</option>
          {industryOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={noticeFilter} onChange={(e) => setNoticeFilter(e.target.value)} className={selectClass}>
          <option value="">All notice periods</option>
          {noticeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={relocationFilter} onChange={(e) => setRelocationFilter(e.target.value)} className={selectClass}>
          <option value="">Relocation: any</option>
          <option value="Yes">Open to relocation</option>
          <option value="No">Not open to relocation</option>
        </select>
        <input
          type="number"
          min={0}
          value={minExp}
          onChange={(e) => setMinExp(e.target.value)}
          placeholder="Min exp (yrs)"
          className="text-[12.5px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <span className="text-[11.5px] text-slate-400">
          {filtered.length} of {members.length}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg shadow-ros-sm overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 whitespace-nowrap">Name</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Email</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Mobile</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Current employer</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Industry</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Specialization</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Experience</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Current CTC</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Location</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Notice</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Relocation</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Status</th>
              <th className="text-left px-3 py-2.5 whitespace-nowrap">Added</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <Link href={`/candidates/${m.id}?groupId=${groupId}`} className="font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600">
                    {m.full_name || "Unnamed"}
                  </Link>
                  {m.candidate_number ? <span className="text-slate-400 text-[11px] ml-1">#{m.candidate_number}</span> : null}
                </td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.email}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.phone ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.current_employer ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.current_industry ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.sub_domain ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatExperience(m.total_experience_years)}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {m.current_fixed_ctc != null ? `₹${m.current_fixed_ctc} LPA` : "—"}
                </td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.current_location ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.notice_period ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.open_to_relocation ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.status ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-400 text-[12px] whitespace-nowrap">{new Date(m.addedAt).toLocaleDateString()}</td>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-6 text-center text-slate-400 text-[12.5px]">
                  No candidates match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
