"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Drawer } from "@/components/ui/drawer";
import { CheckCircle2, Circle, Sparkles, UserRound } from "lucide-react";
import {
  computeTier1GapQuestions,
  buildCandidateUpdateFromTier1Answers,
  type MandateScreeningQuestion,
} from "@/lib/mandate-screening-questions";
import type { ScreeningQuestion } from "./screening-questions-panel";
import type { CurrencyValue } from "@/lib/candidate-options";

export type ScreeningCandidate = {
  id: string;
  full_name: string;
  category: string | null;
  work_mode: string | null;
  open_to_relocation: string | null;
  notice_period: string | null;
  segment_data: Record<string, unknown> | null;
};

export type MandateScreeningContext = {
  mandateId: string;
  role_title: string;
  client_name: string;
  deal_size_currency: string;
  screening_questions: ScreeningQuestion[];
};

const CONTROL_CLS =
  "w-full rounded-ros-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[13px] transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white dark:bg-slate-900";

function toTier2Question(q: ScreeningQuestion): MandateScreeningQuestion {
  return {
    id: q.id,
    text: q.text,
    tier: 2,
    answer_type: q.answer_type ?? "free_text",
    options: q.options ?? [],
    maps_to_field: null,
    source: q.source,
  };
}

export default function MandateScreeningPanel({
  open,
  onClose,
  candidate,
  mandateContext,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  candidate: ScreeningCandidate;
  mandateContext: MandateScreeningContext;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const tier1 = useMemo(
    () => computeTier1GapQuestions(candidate, (mandateContext.deal_size_currency as CurrencyValue) || "INR"),
    [candidate, mandateContext.deal_size_currency]
  );
  const tier2 = useMemo(
    () => (mandateContext.screening_questions ?? []).map(toTier2Question),
    [mandateContext.screening_questions]
  );
  const allQuestions = useMemo(() => [...tier1, ...tier2], [tier1, tier2]);

  const answeredCount = allQuestions.filter((q) => {
    const a = answers[q.id];
    return Array.isArray(a) ? a.length > 0 : !!a?.trim?.();
  }).length;
  const progressPct = allQuestions.length ? Math.round((answeredCount / allQuestions.length) * 100) : 0;

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setSaved(false);
  }

  function toggleMultiOption(id: string, opt: string) {
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    setAnswer(id, current.includes(opt) ? current.filter((o) => o !== opt) : [...current, opt]);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const answeredQuestions = allQuestions.filter((q) => {
        const a = answers[q.id];
        return Array.isArray(a) ? a.length > 0 : !!a?.trim?.();
      });

      if (answeredQuestions.length === 0) {
        setError("Answer at least one question first.");
        setSaving(false);
        return;
      }

      // 1. Persist every answered question against this mandate+candidate,
      // regardless of tier -- this is the permanent screening record.
      const rows = answeredQuestions.map((q) => ({
        mandate_id: mandateContext.mandateId,
        candidate_id: candidate.id,
        tier: q.tier,
        question_id: q.id,
        question_text: q.text,
        answer_type: q.answer_type,
        options: q.options,
        answer: answers[q.id],
        maps_to_field: q.maps_to_field,
      }));
      const { error: upsertError } = await supabase
        .from("mandate_screening_answers")
        .upsert(rows, { onConflict: "mandate_id,candidate_id,question_id" });
      if (upsertError) throw new Error(upsertError.message);

      // 2. Tier 1 answers write straight into the candidate's structured
      // profile -- same fields, same option sets, no free-text ambiguity.
      const tier1Answered = answeredQuestions
        .filter((q) => q.tier === 1 && q.maps_to_field)
        .map((q) => ({ maps_to_field: q.maps_to_field, answer: answers[q.id] }));
      if (tier1Answered.length > 0) {
        const { flat, segmentData } = buildCandidateUpdateFromTier1Answers(candidate.segment_data, tier1Answered);
        const { error: candError } = await supabase
          .from("candidates")
          .update({ ...flat, segment_data: segmentData })
          .eq("id", candidate.id);
        if (candError) throw new Error(candError.message);
      }

      // 3. Tier 2 free-text answers get AI-summarized into a permanent,
      // searchable "mandate discussion" log entry on the candidate.
      const tier2FreeText = answeredQuestions
        .filter((q) => q.tier === 2 && q.answer_type === "free_text")
        .map((q) => ({ question: q.text, answer: String(answers[q.id]) }));

      if (tier2FreeText.length > 0) {
        const res = await fetch("/api/generate-mandate-discussion-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_title: mandateContext.role_title,
            client_name: mandateContext.client_name,
            candidate_name: candidate.full_name,
            qa_pairs: tier2FreeText,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const { data: current } = await supabase
            .from("candidates")
            .select("mandate_discussion_summaries")
            .eq("id", candidate.id)
            .single();
          const existing = Array.isArray(current?.mandate_discussion_summaries)
            ? current.mandate_discussion_summaries
            : [];
          const nextEntry = {
            mandate_id: mandateContext.mandateId,
            client_name: mandateContext.client_name,
            role_title: mandateContext.role_title,
            summary: data.summary,
            tags: data.tags ?? [],
            created_at: new Date().toISOString(),
          };
          await supabase
            .from("candidates")
            .update({ mandate_discussion_summaries: [...existing, nextEntry] })
            .eq("id", candidate.id);
        }
        // A failed AI summary shouldn't block the recruiter -- the raw
        // answers are already saved in mandate_screening_answers either way.
      }

      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save screening answers.");
    } finally {
      setSaving(false);
    }
  }

  function renderQuestion(q: MandateScreeningQuestion) {
    const value = answers[q.id];
    return (
      <div key={q.id} className="rounded-ros-lg border border-slate-200 dark:border-slate-700 p-3">
        <div className="flex items-start gap-2 mb-2">
          {Array.isArray(value) ? value.length > 0 : !!(value as string)?.trim?.() ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
          )}
          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 leading-snug">{q.text}</p>
        </div>

        {q.answer_type === "dropdown" && (
          <select
            className={CONTROL_CLS}
            value={(value as string) ?? ""}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          >
            <option value="">Select...</option>
            {q.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}

        {q.answer_type === "multi_select" && (
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => {
              const selected = Array.isArray(value) && value.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggleMultiOption(q.id, o)}
                  className={`text-[12px] px-2.5 py-1 rounded-ros-full border transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${
                    selected
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {o}
                </button>
              );
            })}
          </div>
        )}

        {q.answer_type === "free_text" && (
          <textarea
            rows={2}
            className={CONTROL_CLS}
            placeholder="Type the candidate's answer..."
            value={(value as string) ?? ""}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          />
        )}
      </div>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title={`Screen ${candidate.full_name}`} widthClassName="max-w-xl">
      <div className="space-y-5">
        <div className="flex items-center gap-2.5 rounded-ros-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <UserRound className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
              {mandateContext.role_title}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{mandateContext.client_name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {answeredCount}/{allQuestions.length} answered
            </p>
            <div className="mt-1 h-1.5 w-20 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 ease-ros"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {tier1.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Complete their profile
              </h3>
              <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-1.5 py-0.5">
                reusable for every future mandate
              </span>
            </div>
            <div className="space-y-2">{tier1.map(renderQuestion)}</div>
          </div>
        )}

        {tier2.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Mandate-specific questions
              </h3>
            </div>
            <div className="space-y-2">{tier2.map(renderQuestion)}</div>
          </div>
        )}

        {allQuestions.length === 0 && (
          <p className="text-[12px] text-slate-400 rounded-ros-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-4 text-center">
            No profile gaps left and no mandate-specific questions generated yet -- add some in the Screening
            question bank above.
          </p>
        )}

        {error && <p className="text-[12px] text-red-600">{error}</p>}

        <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleSave}
            disabled={saving || allQuestions.length === 0}
            className="ros-focusable w-full flex items-center justify-center gap-1.5 rounded-ros-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2.5 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved -- keep answering or close" : "Save screening answers"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
