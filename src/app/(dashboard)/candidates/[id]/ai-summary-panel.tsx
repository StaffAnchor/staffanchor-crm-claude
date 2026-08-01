"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, BadgeCheck, AlertTriangle, CircleHelp, ThumbsUp, ThumbsDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";

type AiPassport = {
  headline?: string;
  compensation_line?: string;
  targets_line?: string;
  stability_line?: string;
  resume_highlights?: string[];
  profile_incomplete?: boolean;
};

// Internal-only decision-support fields -- never sent to
// api/public-ai-summary, never rendered on the client-facing shortlist/
// portal passport views. See src/lib/ai-passport.ts for why this is a
// separate type/column from AiPassport.
type AiDecisionFlags = {
  green_flags?: string[];
  red_flags?: string[];
  watch_areas?: string[];
  recommendation?: "Strong Fit" | "Fit with Reservations" | "Not a Fit";
};

// Internal-only structured skill extraction -- see src/lib/ai-passport.ts's
// SkillInventory type comment for why this is a separate field, purpose-built
// to feed mandate-candidate matching rather than just decorate the profile.
type SkillInventory = {
  core_skills?: string[];
  tools_platforms?: string[];
  domain_expertise?: string[];
  soft_skills?: string[];
};

const RECOMMENDATION_TONE: Record<string, BadgeTone> = {
  "Strong Fit": "success",
  "Fit with Reservations": "warning",
  "Not a Fit": "danger",
};

function stabilityLabelForScore(score: number): "Stable" | "Some Movement" | "Frequent Job-Hopper" {
  if (score >= 71) return "Stable";
  if (score >= 36) return "Some Movement";
  return "Frequent Job-Hopper";
}

const STABILITY_TONE: Record<string, BadgeTone> = {
  Stable: "success",
  "Some Movement": "warning",
  "Frequent Job-Hopper": "danger",
};

export default function AiSummaryPanel({
  candidateId,
  initialSummary,
  initialPassport,
  initialDecisionFlags,
  initialSkillInventory,
  initialStabilityScore,
}: {
  candidateId: string;
  initialSummary: string | null;
  initialPassport?: AiPassport | null;
  initialDecisionFlags?: AiDecisionFlags | null;
  initialSkillInventory?: SkillInventory | null;
  initialStabilityScore?: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const [passport, setPassport] = useState<AiPassport | null>(initialPassport ?? null);
  const [decisionFlags, setDecisionFlags] = useState<AiDecisionFlags | null>(initialDecisionFlags ?? null);
  const [skillInventory, setSkillInventory] = useState<SkillInventory | null>(initialSkillInventory ?? null);
  const [stabilityScore, setStabilityScore] = useState<number | null>(initialStabilityScore ?? null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
      } else {
        setSummary(json.summary);
        setPassport(json.passport ?? null);
        setDecisionFlags(json.decisionFlags ?? null);
        setSkillInventory(json.skillInventory ?? null);
        setStabilityScore(json.stabilityScore ?? null);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const hasFlags =
    !!decisionFlags &&
    ((decisionFlags.green_flags?.length ?? 0) > 0 ||
      (decisionFlags.red_flags?.length ?? 0) > 0 ||
      (decisionFlags.watch_areas?.length ?? 0) > 0 ||
      !!decisionFlags.recommendation);

  const stabilityLabel = stabilityScore != null ? stabilityLabelForScore(stabilityScore) : null;

  const hasSkillInventory =
    !!skillInventory &&
    ((skillInventory.core_skills?.length ?? 0) > 0 ||
      (skillInventory.tools_platforms?.length ?? 0) > 0 ||
      (skillInventory.domain_expertise?.length ?? 0) > 0 ||
      (skillInventory.soft_skills?.length ?? 0) > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          AI summary <span className="text-[11px] font-normal text-slate-400">(prose is shown to clients; flags/verdict below are internal only)</span>
        </h3>
        <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading} icon={loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}>
          {summary ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {error && <p className="text-[12px] text-rose-600 mb-2">{error}</p>}
      {passport?.profile_incomplete && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-amber-700 bg-amber-50 rounded-ros-md px-2.5 py-1.5 mb-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Profile incomplete — this candidate hasn&apos;t finished registering yet, so the summary below is based on
          limited information. It will regenerate automatically once they complete their profile.
        </p>
      )}

      {/* Decision-support block: the first thing a recruiter should see when
          deciding whether to shortlist or reject -- an explicit AI verdict
          plus scannable green/red/grey flags, ahead of the narrative prose
          below. Internal only (see AiDecisionFlags comment above). */}
      {hasFlags && (
        <div className="mb-3 rounded-ros-md border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              AI read (internal — not shown to client)
            </p>
            <div className="flex items-center gap-1.5">
              {stabilityLabel && (
                <Badge tone={STABILITY_TONE[stabilityLabel] ?? "neutral"} size="sm" icon={<TrendingUp className="w-3 h-3" />}>
                  {stabilityScore}/100 · {stabilityLabel}
                </Badge>
              )}
              {decisionFlags?.recommendation && (
                <Badge tone={RECOMMENDATION_TONE[decisionFlags.recommendation] ?? "neutral"} size="sm">
                  {decisionFlags.recommendation}
                </Badge>
              )}
            </div>
          </div>
          {decisionFlags?.green_flags && decisionFlags.green_flags.length > 0 && (
            <div className="space-y-1">
              {decisionFlags.green_flags.map((f, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[12.5px] text-emerald-700 dark:text-emerald-400">
                  <ThumbsUp className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
          {decisionFlags?.red_flags && decisionFlags.red_flags.length > 0 && (
            <div className="space-y-1">
              {decisionFlags.red_flags.map((f, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[12.5px] text-rose-700 dark:text-rose-400">
                  <ThumbsDown className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
          {decisionFlags?.watch_areas && decisionFlags.watch_areas.length > 0 && (
            <div className="space-y-1">
              {decisionFlags.watch_areas.map((f, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[12.5px] text-amber-700 dark:text-amber-400">
                  <CircleHelp className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[13px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-ros-md p-3">
        {summary || "Not generated yet — click Generate to summarize this candidate from their profile data."}
      </p>
      {passport?.resume_highlights && passport.resume_highlights.length > 0 && (
        <div className="mt-2 bg-slate-50 dark:bg-slate-800/50 rounded-ros-md p-3">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
            From their resume
          </p>
          <ul className="space-y-1">
            {passport.resume_highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-slate-600 dark:text-slate-400">
                <BadgeCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skill inventory: internal-only, structured extraction (not the
          free-text skills field) purpose-built to feed mandate-candidate
          matching -- see src/lib/ai-passport.ts SkillInventory comment. */}
      {hasSkillInventory && (
        <div className="mt-2 rounded-ros-md border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Skill inventory (internal — powers mandate matching)
          </p>
          {(
            [
              ["Core skills", skillInventory?.core_skills],
              ["Tools & platforms", skillInventory?.tools_platforms],
              ["Domain expertise", skillInventory?.domain_expertise],
              ["Soft skills", skillInventory?.soft_skills],
            ] as const
          ).map(([label, items]) =>
            items && items.length > 0 ? (
              <div key={label}>
                <p className="text-[10px] text-slate-400 mb-1">{label}</p>
                <div className="flex flex-wrap gap-1">
                  {items.map((s, i) => (
                    <Badge key={i} tone="accent" size="sm">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
