"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, UserPlus } from "lucide-react";

type CandidateOption = {
  id: string;
  full_name: string;
  category: string | null;
  sub_domain: string | null;
  current_employer: string | null;
};

export default function AlignCandidatesPanel({
  mandateId,
  availableCandidates,
}: {
  mandateId: string;
  availableCandidates: CandidateOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableCandidates.slice(0, 30);
    return availableCandidates
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.current_employer ?? "").toLowerCase().includes(q) ||
          (c.sub_domain ?? "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [availableCandidates, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleLink() {
    if (selected.size === 0) return;
    setSaving(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rows = Array.from(selected).map((candidate_id) => ({
      candidate_id,
      mandate_id: mandateId,
      added_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("candidate_mandate_links").insert(rows);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSelected(new Set());
    setQuery("");
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Align existing candidates</h2>
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search candidates by name, employer, sub-domain..."
          className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-[13px]"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 mb-3">
        {filtered.length === 0 && <p className="text-[12px] text-slate-400 py-3 text-center">No matching candidates.</p>}
        {filtered.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-[13px]"
          >
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="flex-1 truncate">
              {c.full_name}
              {c.current_employer && <span className="text-slate-400"> · {c.current_employer}</span>}
            </span>
          </label>
        ))}
      </div>

      {error && <p className="text-[12px] text-red-600 mb-2">{error}</p>}

      <button
        onClick={handleLink}
        disabled={saving || selected.size === 0}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-40"
      >
        <UserPlus className="w-3.5 h-3.5" />
        {saving ? "Linking..." : `Link ${selected.size || ""} candidate${selected.size === 1 ? "" : "s"}`}
      </button>

      <Link href="/candidates/new" className="block text-center text-[12px] text-blue-600 hover:underline mt-2">
        Or create a brand new candidate profile
      </Link>
    </div>
  );
}
