"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageCircleQuestion, Sparkles, X, Plus, Check } from "lucide-react";

export type ScreeningQuestion = {
  id: string;
  text: string;
  source: "ai" | "recruiter";
  answer_type?: "dropdown" | "multi_select" | "free_text";
  options?: string[];
};

export default function ScreeningQuestionsPanel({
  mandateId,
  initialQuestions,
  context,
}: {
  mandateId: string;
  initialQuestions: ScreeningQuestion[];
  context: {
    role_title: string;
    category: string | null;
    sub_domains: string[];
    sales_cycle: string | null;
    deal_size_band: string | null;
    customer_profile: string | null;
    jd_candidate_profile: string | null;
    must_haves: string[];
    team_handling: string | null;
    team_size_band: string | null;
    work_mode: string | null;
    cities: string[];
  };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [questions, setQuestions] = useState<ScreeningQuestion[]>(initialQuestions);
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function persist(next: ScreeningQuestion[]) {
    setQuestions(next);
    setSaving(true);
    setSaved(false);
    await supabase.from("mandates").update({ screening_questions: next }).eq("id", mandateId);
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 1500);
  }

  function addManual() {
    const text = draft.trim();
    if (!text) return;
    persist([...questions, { id: crypto.randomUUID(), text, source: "recruiter" }]);
    setDraft("");
  }

  function remove(id: string) {
    persist(questions.filter((q) => q.id !== id));
  }

  async function handleGenerate() {
    setGenError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-screening-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_title: context.role_title,
          category: context.category,
          sub_domains: context.sub_domains,
          sales_cycle: context.sales_cycle,
          deal_size_band: context.deal_size_band,
          customer_profile: context.customer_profile,
          jd_candidate_profile: context.jd_candidate_profile,
          must_haves: context.must_haves,
          team_handling: context.team_handling,
          team_size_band: context.team_size_band,
          work_mode: context.work_mode,
          cities: context.cities,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI generation failed.");
      const newOnes: ScreeningQuestion[] = data.questions ?? [];
      // Append rather than replace, so re-generating doesn't wipe out
      // recruiter-added or previously-generated questions they already like.
      await persist([...questions, ...newOnes]);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "AI generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <MessageCircleQuestion className="w-3.5 h-3.5 text-slate-400" /> Screening question bank
        </h2>
        <button
          onClick={handleGenerate}
          disabled={generating || !context.role_title}
          className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" /> {generating ? "Generating..." : "Generate with AI"}
        </button>
      </div>
      <p className="text-[12px] text-slate-400 mb-2">
        Targeted questions for screening calls against this mandate. Recruiters answer these per-candidate from the
        Screen action in the candidate table below -- answers become structured, searchable profile data, not just
        notes.
      </p>
      {genError && <p className="text-[11px] text-red-600 mb-2">{genError}</p>}

      <div className="space-y-1.5 mb-2">
        {questions.length === 0 && (
          <p className="text-[12px] text-slate-400 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2">
            No questions yet -- generate with AI or add your own below.
          </p>
        )}
        {questions.map((q, i) => (
          <div
            key={q.id}
            className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5"
          >
            <span className="text-[11px] text-slate-400 mt-0.5">{i + 1}.</span>
            <span className="flex-1 text-[13px] text-slate-700 dark:text-slate-300">{q.text}</span>
            {q.source === "ai" && (
              <span className="shrink-0 rounded-full bg-blue-50 text-blue-600 text-[10px] font-medium px-1.5 py-0.5">AI</span>
            )}
            <button onClick={() => remove(q.id)} className="text-slate-400 hover:text-red-600 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addManual();
            }
          }}
          placeholder="Add your own question..."
          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px]"
        />
        <button
          onClick={addManual}
          className="rounded-lg border border-slate-300 px-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {(saving || saved) && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600 mt-2">
          {saved && <Check className="w-3 h-3" />} {saving ? "Saving..." : "Saved"}
        </p>
      )}
    </div>
  );
}
