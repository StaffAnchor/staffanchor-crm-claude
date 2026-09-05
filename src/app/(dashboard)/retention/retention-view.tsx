"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export type RetentionRow = {
  id: string;
  checkin_type: string;
  due_date: string;
  completed_at: string | null;
  outcome: string | null;
  notes: string | null;
  candidate_id: string | null;
  candidate_name: string;
  candidate_employer: string | null;
  role_title: string;
  client_name: string;
  date_of_joining: string | null;
};

const CHECKIN_LABEL: Record<string, string> = { "30_day": "30-day", "90_day": "90-day", "180_day": "180-day" };
const OUTCOME_LABEL: Record<string, string> = {
  active_no_issues: "Active, no issues",
  strong_performer: "Strong performer",
  performance_concern: "Performance concern",
  attrited: "Attrited",
};
const OUTCOME_TONE: Record<string, BadgeTone> = {
  active_no_issues: "neutral",
  strong_performer: "success",
  performance_concern: "warning",
  attrited: "danger",
};

function isOverdue(dueDate: string, completedAt: string | null) {
  return !completedAt && new Date(dueDate) < new Date(new Date().toDateString());
}

export default function RetentionView({
  initialRows,
  fetchError,
}: {
  initialRows: RetentionRow[];
  fetchError: string | null;
}) {
  const [filter, setFilter] = useState<"open" | "overdue" | "completed" | "all">("open");

  const filtered = useMemo(() => {
    if (filter === "all") return initialRows;
    if (filter === "completed") return initialRows.filter((r) => r.completed_at);
    if (filter === "overdue") return initialRows.filter((r) => isOverdue(r.due_date, r.completed_at));
    return initialRows.filter((r) => !r.completed_at);
  }, [initialRows, filter]);

  const overdueCount = initialRows.filter((r) => isOverdue(r.due_date, r.completed_at)).length;

  if (fetchError) {
    return <p className="text-sm text-red-600">{fetchError}</p>;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-8">
      <div className="mb-5">
        <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">Retention</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
          Post-placement check-ins, auto-scheduled at 30/90/180 days after a candidate&apos;s join date.
        </p>
      </div>
      <div className="flex items-center gap-1.5 mb-4">
        {(["open", "overdue", "completed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium capitalize transition-colors ${
              filter === f
                ? "bg-teal-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f === "overdue" && overdueCount > 0 ? `Overdue (${overdueCount})` : f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">Nothing here.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <RetentionRowCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function RetentionRowCard({ row }: { row: RetentionRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [outcome, setOutcome] = useState(row.outcome ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const overdue = isOverdue(row.due_date, row.completed_at);

  async function handleSave() {
    if (!outcome) return;
    setSaving(true);
    await supabase
      .from("placement_retention_checkins")
      .update({ outcome, notes: notes.trim() || null, completed_at: new Date().toISOString() })
      .eq("id", row.id);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {row.candidate_id ? (
              <Link href={`/candidates/${row.candidate_id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:underline">
                {row.candidate_name}
              </Link>
            ) : (
              <span className="font-medium text-slate-900 dark:text-slate-100">{row.candidate_name}</span>
            )}
            <Badge tone="neutral" size="sm">
              {CHECKIN_LABEL[row.checkin_type] ?? row.checkin_type}
            </Badge>
            {row.completed_at ? (
              row.outcome && <Badge tone={OUTCOME_TONE[row.outcome] ?? "neutral"} size="sm">{OUTCOME_LABEL[row.outcome] ?? row.outcome}</Badge>
            ) : overdue ? (
              <Badge tone="danger" size="sm">Overdue</Badge>
            ) : (
              <Badge tone="info" size="sm">Upcoming</Badge>
            )}
          </div>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            {row.role_title} · {row.client_name}
            {row.candidate_employer ? ` · now at ${row.candidate_employer}` : ""}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Due {new Date(row.due_date).toLocaleDateString()}
            {row.date_of_joining ? ` · joined ${new Date(row.date_of_joining).toLocaleDateString()}` : ""}
          </p>
        </div>
      </div>

      {!row.completed_at && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2">
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">Log outcome...</option>
            {Object.entries(OUTCOME_LABEL).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[12.5px]"
          />
          <button
            onClick={handleSave}
            disabled={!outcome || saving}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-[12.5px] font-medium px-3 py-1.5"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
      {row.completed_at && row.notes && (
        <p className="mt-2 text-[12.5px] text-slate-600 dark:text-slate-400 pl-0.5">{row.notes}</p>
      )}
    </div>
  );
}
