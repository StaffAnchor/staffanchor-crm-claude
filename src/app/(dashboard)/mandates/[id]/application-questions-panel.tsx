"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, ArrowUp, ArrowDown, ListOrdered, Hash, ToggleLeft, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Candidate-facing screening questions -- answered on jobs.staffanchor.com as
// part of Quick Apply, before the application is even recorded (e.g. "What
// is your current fixed CTC?" or "Are you comfortable with night shifts?").
// Deliberately a separate table/panel from the existing AI-generated
// "Screening & Matching" tab's screening_questions (mandates.screening_questions
// jsonb) -- that one is a recruiter's own call-screening script (dropdown/
// multi-select, used inside the CRM only), this one is short/yes-no/numeric
// questions a candidate answers themselves on the public listing. Answers
// land in mandate_application_answers (deliberately NOT mandate_screening_answers
// -- that table already existed for the unrelated recruiter call-screening
// drawer), one row per (candidate, question), and are visible on each
// applicant's card -- see quick-apply-funnel-panel.tsx and
// mandate-candidates-table.tsx.
export type ApplicationQuestion = {
  id: string;
  question_text: string;
  answer_type: "short_answer" | "yes_no" | "numeric";
  is_required: boolean;
  display_order: number;
};

const TYPE_META: Record<ApplicationQuestion["answer_type"], { label: string; icon: typeof Hash }> = {
  short_answer: { label: "Short answer", icon: MessageSquareText },
  yes_no: { label: "Yes / No", icon: ToggleLeft },
  numeric: { label: "Numeric", icon: Hash },
};

export default function ApplicationQuestionsPanel({
  mandateId,
  initialQuestions,
}: {
  mandateId: string;
  initialQuestions: ApplicationQuestion[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(
    [...initialQuestions].sort((a, b) => a.display_order - b.display_order)
  );
  const [text, setText] = useState("");
  const [type, setType] = useState<ApplicationQuestion["answer_type"]>("short_answer");
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  async function addQuestion() {
    const question_text = text.trim();
    if (!question_text) return;
    setSaving(true);
    const nextOrder = questions.length ? Math.max(...questions.map((q) => q.display_order)) + 1 : 0;
    const { data, error } = await supabase
      .from("mandate_screening_questions")
      .insert({
        mandate_id: mandateId,
        question_text,
        answer_type: type,
        is_required: required,
        display_order: nextOrder,
      })
      .select("id, question_text, answer_type, is_required, display_order")
      .single();
    setSaving(false);
    if (error || !data) {
      window.alert(`Couldn't add question: ${error?.message ?? "Unknown error"}`);
      return;
    }
    setQuestions((prev) => [...prev, data as ApplicationQuestion]);
    setText("");
    setType("short_answer");
    setRequired(true);
    router.refresh();
  }

  async function removeQuestion(id: string) {
    if (!window.confirm("Remove this question? Existing candidate answers to it will also be deleted.")) return;
    const { error } = await supabase.from("mandate_screening_questions").delete().eq("id", id);
    if (error) {
      window.alert(`Couldn't remove question: ${error.message}`);
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    router.refresh();
  }

  async function move(id: string, direction: "up" | "down") {
    const idx = questions.findIndex((q) => q.id === id);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= questions.length) return;
    const reordered = [...questions];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
    // Reassign display_order to plain 0..n-1 so ties never accumulate across
    // repeated reorders.
    const withOrders = reordered.map((q, i) => ({ ...q, display_order: i }));
    setQuestions(withOrders);
    await Promise.all(
      withOrders.map((q) => supabase.from("mandate_screening_questions").update({ display_order: q.display_order }).eq("id", q.id))
    );
    router.refresh();
  }

  async function toggleRequired(id: string, next: boolean) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, is_required: next } : q)));
    await supabase.from("mandate_screening_questions").update({ is_required: next }).eq("id", id);
    router.refresh();
  }

  return (
    <Card className="mt-4">
      <div className="flex items-center gap-2 mb-1">
        <ListOrdered className="w-4 h-4 text-teal-600" />
        <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Application Questions</p>
      </div>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
        Candidates answer these on jobs.staffanchor.com when applying to this mandate, before their application is
        recorded — e.g. &quot;What is your current fixed CTC?&quot; (Numeric) or &quot;Are you comfortable with night
        shifts?&quot; (Yes/No). Applies to new applications going forward.
      </p>

      {questions.length === 0 ? (
        <p className="text-[12px] text-slate-400 mb-3">No application questions yet — add one below.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {questions.map((q, i) => {
            const Icon = TYPE_META[q.answer_type].icon;
            return (
              <div
                key={q.id}
                className="flex items-start gap-3 rounded-ros-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-3 py-2.5"
              >
                <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(q.id, "up")}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === questions.length - 1}
                    onClick={() => move(q.id, "down")}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                      <Icon className="w-3 h-3 mr-1" />
                      {TYPE_META[q.answer_type].label}
                    </Badge>
                    <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.is_required}
                        onChange={(e) => toggleRequired(q.id, e.target.checked)}
                        className="accent-teal-600"
                      />
                      Required
                    </label>
                  </div>
                  <p className="text-[13px] text-slate-800 dark:text-slate-200 mt-1">{q.question_text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeQuestion(q.id)}
                  className="text-slate-300 hover:text-rose-600 shrink-0"
                  title="Remove question"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-ros-md border border-dashed border-slate-200 dark:border-slate-700 p-3">
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">Add a question</p>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. What is your current fixed CTC?"
          className="w-full text-[13px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ApplicationQuestion["answer_type"])}
            className="text-[12.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
          >
            <option value="short_answer">Short answer</option>
            <option value="yes_no">Yes / No</option>
            <option value="numeric">Numeric</option>
          </select>
          <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-teal-600" />
            Required
          </label>
          <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={addQuestion} disabled={saving || !text.trim()}>
            Add question
          </Button>
        </div>
      </div>
    </Card>
  );
}
