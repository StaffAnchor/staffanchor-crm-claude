"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FileText, Check, Pencil, Sparkles } from "lucide-react";

type JDFields = {
  jd_overview: string | null;
  jd_responsibilities: string | null;
  jd_candidate_profile: string | null;
  jd_compensation_benefits: string | null;
};

function bulletList(value: string) {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

type MandateContext = {
  role_title: string | null;
  category: string | null;
  sub_domains: string[] | null;
  cities: string[] | null;
  experience_min: number | null;
  experience_max: number | null;
  budget_min: number | null;
  budget_max: number | null;
};

export default function JobDescriptionPanel({
  mandateId,
  initial,
  context,
}: {
  mandateId: string;
  initial: JDFields;
  context: MandateContext;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rawNotes, setRawNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const hasAnyContent = !!(
    initial.jd_overview ||
    initial.jd_responsibilities ||
    initial.jd_candidate_profile ||
    initial.jd_compensation_benefits
  );
  const [editing, setEditing] = useState(!hasAnyContent);
  const [overview, setOverview] = useState(initial.jd_overview ?? "");
  const [responsibilities, setResponsibilities] = useState(initial.jd_responsibilities ?? "");
  const [candidateProfile, setCandidateProfile] = useState(initial.jd_candidate_profile ?? "");
  const [benefits, setBenefits] = useState(initial.jd_compensation_benefits ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleGenerate() {
    setGenError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_title: context.role_title,
          category: context.category,
          sub_domains: context.sub_domains ?? [],
          cities: context.cities ?? [],
          experience_min: context.experience_min ?? "",
          experience_max: context.experience_max ?? "",
          budget_min: context.budget_min ?? "",
          budget_max: context.budget_max ?? "",
          raw_notes: rawNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI generation failed.");
      setOverview(data.overview ?? overview);
      setResponsibilities((data.responsibilities ?? []).join("\n"));
      setCandidateProfile((data.candidate_profile ?? []).join("\n"));
      setBenefits((data.compensation_benefits ?? []).join("\n"));
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "AI generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("mandates")
      .update({
        jd_overview: overview || null,
        jd_responsibilities: responsibilities || null,
        jd_candidate_profile: candidateProfile || null,
        jd_compensation_benefits: benefits || null,
      })
      .eq("id", mandateId);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" /> Job description
        </h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[12px] text-slate-400 mb-3">Shown to candidates on the public job listing.</p>

      {editing ? (
        <div className="space-y-3 mb-2">
          <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-3">
            <p className="text-[11px] font-medium text-blue-700 mb-1.5">Paste rough notes and let AI structure it</p>
            <textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              rows={3}
              placeholder="Paste a rough JD, bullet notes, or a client email..."
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] resize-y bg-white"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !rawNotes.trim()}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" /> {generating ? "Generating..." : "Generate with AI"}
            </button>
            {genError && <p className="text-[11px] text-red-600 mt-1.5">{genError}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Overview</label>
            <textarea
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              rows={2}
              placeholder="1-2 sentence intro to the role/company"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] resize-y"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Key Responsibilities (one per line)</label>
            <textarea
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] resize-y"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Candidate Profile (one per line)</label>
            <textarea
              value={candidateProfile}
              onChange={(e) => setCandidateProfile(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] resize-y"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Compensation &amp; Benefits (one per line)</label>
            <textarea
              value={benefits}
              onChange={(e) => setBenefits(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] resize-y"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      ) : (
        <div className="text-[13px] text-slate-700 space-y-3">
          {overview && <p className="whitespace-pre-wrap">{overview}</p>}
          {responsibilities && (
            <div>
              <p className="font-semibold text-slate-900 mb-1">Key Responsibilities</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {bulletList(responsibilities).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {candidateProfile && (
            <div>
              <p className="font-semibold text-slate-900 mb-1">Candidate Profile</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {bulletList(candidateProfile).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {benefits && (
            <div>
              <p className="font-semibold text-slate-900 mb-1">Compensation &amp; Benefits</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {bulletList(benefits).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {!hasAnyContent && <span className="text-slate-400">No description yet.</span>}
        </div>
      )}

      {saved && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600 mt-2">
          <Check className="w-3 h-3" /> Saved
        </p>
      )}
    </div>
  );
}
