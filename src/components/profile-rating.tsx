"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Star } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  RATING_LABEL,
  STRONG_REASONS,
  WEAK_REASONS,
  reasonLabel,
  type ProfileRating,
  type ProfileRatingRow,
} from "@/lib/profile-rating";

// Every rated candidate (the table is small), keyed by id, so any list can
// show a badge without a query per row.
export function useProfileRatings() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ProfileRatingRow[]>([]);
  useEffect(() => {
    let alive = true;
    supabase
      .from("candidate_profile_ratings")
      .select("candidate_id, rating, reasons, note, rated_by_name")
      .then(({ data }) => {
        if (alive) setRows((data ?? []) as ProfileRatingRow[]);
      });
    return () => {
      alive = false;
    };
  }, [supabase]);
  return useMemo(() => new Map(rows.map((r) => [r.candidate_id, r])), [rows]);
}

export async function saveProfileRating(
  supabase: SupabaseClient,
  candidateId: string,
  value: { rating: ProfileRating; reasons: string[]; note: string },
  sourceMandateId?: string | null
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: prof } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
  const { error } = await supabase.from("candidate_profile_ratings").upsert(
    {
      candidate_id: candidateId,
      rating: value.rating,
      reasons: value.reasons,
      note: value.note.trim() || null,
      source_mandate_id: sourceMandateId ?? null,
      rated_by: user?.id ?? null,
      rated_by_name: prof?.full_name ?? null,
      rated_at: new Date().toISOString(),
    },
    { onConflict: "candidate_id" }
  );
  return error ? error.message : null;
}

export function ProfileRatingBadge({ row }: { row: ProfileRatingRow | null | undefined }) {
  if (!row) return null;
  const strong = row.rating === "strong";
  const detail = [row.reasons.map(reasonLabel).join(", "), row.note, row.rated_by_name ? `by ${row.rated_by_name}` : null].filter(Boolean).join(" · ");
  return (
    <span
      title={detail || RATING_LABEL[row.rating]}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-medium ${
        strong
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
          : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
      }`}
    >
      {strong ? <Star className="h-3 w-3" /> : <Flag className="h-3 w-3" />}
      {RATING_LABEL[row.rating]}
    </span>
  );
}

export type RatingDraft = { rating: ProfileRating | null; reasons: string[]; note: string };
export const emptyDraft: RatingDraft = { rating: null, reasons: [], note: "" };

// Average / Strong / Weak, then the reasons that fit. `average` means "leave
// as it is" and is the default, so nothing is forced.
export function RatingPicker({
  draft,
  onChange,
  strongLabel = "Strong profile",
  averageLabel = "Average / skip",
}: {
  draft: RatingDraft;
  onChange: (d: RatingDraft) => void;
  strongLabel?: string;
  averageLabel?: string;
}) {
  const reasons = draft.rating === "weak" ? WEAK_REASONS : draft.rating === "strong" ? STRONG_REASONS : [];
  const pick = (r: ProfileRating | null) => onChange({ rating: r, reasons: [], note: draft.note });
  const btn = (active: boolean, tone: string) =>
    `rounded-lg border px-2.5 py-1.5 text-[12px] font-medium ${active ? tone : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => pick(null)} className={btn(draft.rating === null, "border-slate-400 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100")}>
          {averageLabel}
        </button>
        <button type="button" onClick={() => pick("strong")} className={btn(draft.rating === "strong", "border-emerald-400 bg-emerald-50 text-emerald-800")}>
          {strongLabel}
        </button>
        <button type="button" onClick={() => pick("weak")} className={btn(draft.rating === "weak", "border-rose-400 bg-rose-50 text-rose-800")}>
          Weak profile
        </button>
      </div>
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((r) => {
            const on = draft.reasons.includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => onChange({ ...draft, reasons: on ? draft.reasons.filter((x) => x !== r.value) : [...draft.reasons, r.value] })}
                className={`rounded-full border px-2 py-0.5 text-[11.5px] ${on ? "border-slate-700 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}
      {draft.rating && (
        <input
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          placeholder="Note (optional)"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-900"
        />
      )}
    </div>
  );
}

// The control on a candidate's own page: see the current mark, change it, or clear it.
export function ProfileRatingPanel({ candidateId }: { candidateId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [row, setRow] = useState<ProfileRatingRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RatingDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase
      .from("candidate_profile_ratings")
      .select("candidate_id, rating, reasons, note, rated_by_name")
      .eq("candidate_id", candidateId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setRow((data as ProfileRatingRow | null) ?? null);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [supabase, candidateId, version]);

  async function save() {
    if (!draft.rating) return;
    setBusy(true);
    setError(null);
    const err = await saveProfileRating(supabase, candidateId, { rating: draft.rating, reasons: draft.reasons, note: draft.note });
    setBusy(false);
    if (err) return setError(err);
    setEditing(false);
    setVersion((v) => v + 1);
  }

  async function clear() {
    setBusy(true);
    setError(null);
    const { error: delError } = await supabase.from("candidate_profile_ratings").delete().eq("candidate_id", candidateId);
    setBusy(false);
    if (delError) return setError(delError.message);
    setRow(null);
    setEditing(false);
  }

  if (!loaded) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="font-medium text-slate-700 dark:text-slate-200">CV quality</span>
          {row ? (
            <>
              <ProfileRatingBadge row={row} />
              <span className="text-slate-500 dark:text-slate-400">
                {[row.reasons.map(reasonLabel).join(", "), row.note].filter(Boolean).join(" · ")}
              </span>
            </>
          ) : (
            <span className="text-slate-400">Not marked. Internal only, never shown to clients.</span>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => {
              setDraft(row ? { rating: row.rating, reasons: row.reasons, note: row.note ?? "" } : emptyDraft);
              setEditing(true);
            }}
            className="text-[12px] font-medium text-blue-600 hover:underline"
          >
            {row ? "Change" : "Mark this CV"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2 space-y-2">
          <RatingPicker draft={draft} onChange={setDraft} averageLabel="Not marked" />
          <div className="flex items-center gap-2">
            <button disabled={busy || !draft.rating} onClick={save} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-[12px] text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            {row && (
              <button disabled={busy} onClick={clear} className="ml-auto text-[12px] text-rose-600 hover:underline">
                Clear mark
              </button>
            )}
          </div>
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
