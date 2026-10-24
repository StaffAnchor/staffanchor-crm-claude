"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, TrendingUp } from "lucide-react";
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

  const SHOWN = 3;
  const dots: { label: string; dot: string; items: string[] }[] = [
    { label: "Strengths", dot: "bg-emerald-500", items: decisionFlags?.green_flags ?? [] },
    { label: "Concerns", dot: "bg-rose-500", items: decisionFlags?.red_flags ?? [] },
    { label: "To check", dot: "bg-amber-500", items: decisionFlags?.watch_areas ?? [] },
  ].filter((g) => g.items.length > 0);
  const skills = Array.from(new Set([...(skillInventory?.core_skills ?? []), ...(skillInventory?.domain_expertise ?? [])]));
  const moreSkills = Array.from(new Set([...(skillInventory?.tools_platforms ?? []), ...(skillInventory?.soft_skills ?? [])]));
  const sentence = (t: string) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : t);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 dark:text-slate-100" title="The summary text can be shown to clients. Strengths, concerns and skills are internal only.">
          <Sparkles className="w-4 h-4 text-teal-600" />
          AI summary
        </h3>
        <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading} icon={loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}>
          {summary ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

      {(decisionFlags?.recommendation || stabilityLabel) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {decisionFlags?.recommendation && (
            <Badge tone={RECOMMENDATION_TONE[decisionFlags.recommendation] ?? "neutral"} size="sm" className="normal-case tracking-normal text-[12.5px]">
              {decisionFlags.recommendation}
            </Badge>
          )}
          {stabilityLabel && (
            <Badge tone={STABILITY_TONE[stabilityLabel] ?? "neutral"} size="sm" icon={<TrendingUp className="w-3 h-3" />} className="normal-case tracking-normal text-[12.5px]">
              Stability {stabilityScore}/100, {stabilityLabel.toLowerCase()}
            </Badge>
          )}
        </div>
      )}

      <p className="mt-3 text-[14px] leading-6 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
        {summary || "Not generated yet. Click Generate to summarise this candidate from their profile data."}
      </p>

      {passport?.profile_incomplete && <p className="mt-2 text-[12.5px] text-slate-500">Based on limited information: they have not finished registering. It updates once they do.</p>}

      {hasFlags && dots.length > 0 && (
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {dots.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-[12.5px] font-medium text-slate-500 dark:text-slate-400">{g.label}</p>
              <ul className="space-y-1.5">
                {g.items.slice(0, SHOWN).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
                    <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${g.dot}`} aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {g.items.length > SHOWN && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[12px] text-teal-700 dark:text-teal-300">{g.items.length - SHOWN} more</summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {g.items.slice(SHOWN).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
                        <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${g.dot}`} aria-hidden />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {hasSkillInventory && (skills.length > 0 || moreSkills.length > 0) && (
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-medium text-slate-500 dark:text-slate-400">Skills</p>
          <p className="text-[13px] leading-6 text-slate-700 dark:text-slate-300">{skills.map(sentence).join(" · ")}</p>
          {moreSkills.length > 0 && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[12px] text-teal-700 dark:text-teal-300">Tools and soft skills</summary>
              <p className="mt-1.5 text-[13px] leading-6 text-slate-600 dark:text-slate-400">{moreSkills.map(sentence).join(" · ")}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
