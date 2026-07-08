"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FileText, Check, Pencil } from "lucide-react";

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

export default function JobDescriptionPanel({
  mandateId,
  initial,
}: {
  mandateId: string;
  initial: JDFields;
}) {
  const router = useRouter();
  const supabase = createClient();
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
