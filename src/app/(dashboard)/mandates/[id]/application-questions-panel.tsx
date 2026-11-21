"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, ArrowUp, ArrowDown, ListOrdered, Hash, ToggleLeft, MessageSquareText, Sparkles } from "lucide-react";
import { APPLY_TYPE_LABEL, normQuestion, type GeneratedQuestion } from "@/lib/application-questions";
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
  short_answer: { label: APPLY_TYPE_LABEL.short_answer, icon: MessageSquareText },
  yes_no: { label: APPLY_TYPE_LABEL.yes_no, icon: ToggleLeft },
  numeric: { label: APPLY_TYPE_LABEL.numeric, icon: Hash },
};

/** What the AI needs to know about the role. */
export type ApplyQuestionContext = {
  role_title: string;
  category: string | null;
  sub_domains: string[];
  must_haves: string[];
  good_to_haves: string[];
  cities: string[];
  work_mode: string | null;
  working_days: string | null;
  shift_timing: string | null;
  requires_own_device: boolean;
  jd_overview: string | null;
  jd_candidate_profile: string | null;
  sales_cycle: string | null;
  deal_size_band: string | null;
};

export default function ApplicationQuestionsPanel({
  mandateId,
  initialQuestions,
  context,
}: {
  mandateId: string;
  initialQuestions: ApplicationQuestion[];
  context?: ApplyQuestionContext;
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
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Questions used on other roles, most used first, so a good one is one click away next time.
  const [library, setLibrary] = useState<{ text: string; type: ApplicationQuestion["answer_type"]; required: boolean; uses: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("mandate_screening_questions").select("question_text, answer_type, is_required").order("created_at", { ascending: false }).limit(600);
      if (cancelled || !data) return;
      const by = new Map<string, { text: string; type: ApplicationQuestion["answer_type"]; required: boolean; uses: number }>();
      for (const r of data as { question_text: string; answer_type: ApplicationQuestion["answer_type"]; is_required: boolean }[]) {
        const k = r.question_text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const cur = by.get(k);
        if (cur) cur.uses += 1;
        else by.set(k, { text: r.question_text, type: r.answer_type, required: r.is_required, uses: 1 });
      }
      setLibrary([...by.values()].sort((a, b) => b.uses - a.uses));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const suggestions = useMemo(() => {
    const have = new Set(questions.map((q) => q.question_text.toLowerCase().trim()));
    return library.filter((l) => !have.has(l.text.toLowerCase().trim())).slice(0, 8);
  }, [library, questions]);


  // Basic questions first (pay, place and days, working now, how soon they can join), then a few simple ones from the job description.
  async function generate() {
    if (!context) return;
    setGenerating(true);
    setGenMessage(null);
    try {
      const res = await fetch("/api/generate-application-questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context) });
      const data = (await res.json()) as { questions?: GeneratedQuestion[]; note?: string | null; error?: string };
      if (!res.ok || !data.questions) throw new Error(data.error ?? "That did not work. Try again.");
      const have = new Set(questions.map((q) => normQuestion(q.question_text)));
      const fresh = data.questions.filter((q) => !have.has(normQuestion(q.question_text)));
      if (fresh.length === 0) {
        setGenMessage({ ok: true, text: "Every question it would ask is already here." });
        return;
      }
      const base = questions.length ? Math.max(...questions.map((q) => q.display_order)) + 1 : 0;
      const { data: inserted, error } = await supabase
        .from("mandate_screening_questions")
        .insert(fresh.map((q, i) => ({ mandate_id: mandateId, question_text: q.question_text, answer_type: q.answer_type, is_required: q.is_required, display_order: base + i })))
        .select("id, question_text, answer_type, is_required, display_order");
      if (error || !inserted) throw new Error(error?.message ?? "Couldn't save the questions.");
      // Basics go to the front, then what was already there, then the job-description ones.
      const kindOf = new Map(fresh.map((q) => [normQuestion(q.question_text), q.kind]));
      const added = inserted as ApplicationQuestion[];
      const front = added.filter((q) => kindOf.get(normQuestion(q.question_text)) === "basic");
      const back = added.filter((q) => kindOf.get(normQuestion(q.question_text)) !== "basic");
      const ordered = [...front, ...questions, ...back].map((q, i) => ({ ...q, display_order: i }));
      await Promise.all(ordered.map((q) => supabase.from("mandate_screening_questions").update({ display_order: q.display_order }).eq("id", q.id)));
      setQuestions(ordered);
      const count = (t: string) => added.filter((q) => q.answer_type === t).length;
      setGenMessage({
        ok: true,
        text: `Added ${front.length} basic ${front.length === 1 ? "question" : "questions"} (shown first, required) and ${back.length} from the job description (optional). Types: ${count("yes_no")} Yes / No, ${count("numeric")} Number, ${count("short_answer")} Short answer.${data.note ? ` ${data.note}` : ""}`,
      });
      router.refresh();
    } catch (e) {
      setGenMessage({ ok: false, text: e instanceof Error ? e.message : "That did not work. Try again." });
    } finally {
      setGenerating(false);
    }
  }

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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-teal-600" />
          <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Questions candidates answer when they apply</p>
        </div>
        {context && (
          <button type="button" onClick={() => void generate()} disabled={generating} className="inline-flex items-center gap-1 rounded-lg border border-teal-600 px-3 py-1 text-[13px] font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" /> {generating ? "Writing the questions…" : "Generate with AI"}
          </button>
        )}
      </div>
      {genMessage && <p className={`mb-3 rounded-lg px-3 py-2 text-[13px] ${genMessage.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{genMessage.text}</p>}
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-3">
        Candidates answer these on jobs.staffanchor.com when they apply, before the application is recorded. The AI asks the basics first
        (current pay, whether the place and working days suit them, whether they are working now, how soon they can join), then at most three
        simple ones from the job description. Each question shows its type: Yes / No, Number or Short answer. Keep it short so people finish applying. Applies to new applications going forward. Answers about current or expected pay, notice period, total experience, relocation and current city are also saved on the candidate&apos;s profile, and every answer is kept for their later applications.
      </p>

      {questions.length === 0 ? (
        <p className="text-[13px] text-slate-400 mb-3">No application questions yet — add one below.</p>
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
                    <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.is_required}
                        onChange={(e) => toggleRequired(q.id, e.target.checked)}
                        className="accent-teal-600"
                      />
                      Required
                    </label>
                  </div>
                  <p className="text-[14px] text-slate-800 dark:text-slate-200 mt-1">{q.question_text}</p>
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
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Add a question</p>
        {suggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="text-[12px] text-slate-400">Used on other roles:</span>
            {suggestions.map((sg) => (
              <button key={sg.text} type="button" onClick={() => { setText(sg.text); setType(sg.type); setRequired(sg.required); }} title={`Used on ${sg.uses} role${sg.uses === 1 ? "" : "s"}`} className="max-w-[260px] truncate rounded-full border border-slate-200 px-2.5 py-0.5 text-[13px] text-slate-600 hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:text-slate-300">
                {sg.text}
              </button>
            ))}
          </div>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. What is your current fixed CTC?"
          className="w-full text-[14px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ApplicationQuestion["answer_type"])}
            className="text-[13px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
          >
            <option value="short_answer">Short answer</option>
            <option value="yes_no">Yes / No</option>
            <option value="numeric">Numeric</option>
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-400 cursor-pointer">
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
