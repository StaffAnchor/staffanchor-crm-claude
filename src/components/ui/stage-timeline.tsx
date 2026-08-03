// Compact horizontal stage-dot timeline (inspired by Ceipal's Applicant
// Tracker pipeline view) -- reads a candidate's whole mandate history at a
// glance without opening the row or the stage dropdown.
//
// Honest limitation: candidate_mandate_links only stores the CURRENT stage
// plus one stage_updated_at timestamp, not a full per-transition history.
// So unlike Ceipal (which has a real date on every dot because it logs each
// transition), this can only show which stages have been *reached* --
// every dot up to and including the current one renders filled, with the
// single known timestamp attached to the current dot only. That's still a
// real improvement over a bare badge (instant "how far did they get, and
// when did that last change" at a glance), just not a full audit trail.
// If per-transition history ever gets logged, swap this to real per-dot
// dates without changing the calling code.
import { STAGES } from "@/lib/mandate-stage";

// "rejected"/"pulled_back" are terminal off-ramps, not points along the
// main funnel -- rendering them inline with sourced->placed would make the
// happy-path progression unreadable. Anyone in either state gets a plain
// two-segment marker instead (see below).
const MAIN_FUNNEL = STAGES.filter((s) => s !== "rejected" && s !== "pulled_back");

const STAGE_DOT_LABEL: Record<string, string> = {
  sourced: "Sourced",
  screened: "Screened",
  // "Shortlisted" alone reads as identical to "Client shortlist" below despite
  // being an entirely different point in the funnel (recruiter's own
  // pre-submission call vs. the client saying yes post-interview) -- gap #7,
  // July 2026 audit. Labeled to disambiguate everywhere this stage appears.
  shortlisted: "Shortlisted (recruiter)",
  submitted: "Submitted",
  client_interview: "Interview",
  client_shortlisted: "Client shortlist",
  offer: "Offer",
  placed: "Placed",
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Execution-audit gap: the only place staleness was ever visible was the
// Priority Actions inbox's own sweep_recruiter_inbox() thresholds (5 days
// for sourced/screened, 4 for client feedback, etc.) -- a recruiter looking
// straight at a mandate's own pipeline board had no aging signal at all
// unless that specific task happened to already be open in their inbox.
// This mirrors the same "how long has this sat here" read directly on the
// timeline itself, for every non-terminal stage, not just the two the sweep
// happens to cover.
function agingTone(days: number): { label: string; tone: string } | null {
  if (days >= 10) return { label: `${days}d`, tone: "bg-red-100 text-red-700" };
  if (days >= 5) return { label: `${days}d`, tone: "bg-amber-100 text-amber-700" };
  return null;
}

export function StageTimeline({
  stage,
  stageUpdatedAt,
  rejectedFromStage,
}: {
  stage: string;
  stageUpdatedAt: string | null;
  rejectedFromStage?: string | null;
}) {
  const isOffRamp = stage === "rejected" || stage === "pulled_back";
  const anchorStage = isOffRamp ? rejectedFromStage ?? "sourced" : stage;
  const currentIdx = MAIN_FUNNEL.indexOf(anchorStage as (typeof MAIN_FUNNEL)[number]);

  return (
    <div className="flex items-center gap-0.5" title={isOffRamp ? `${stage.replace(/_/g, " ")} at ${anchorStage.replace(/_/g, " ")}` : undefined}>
      {MAIN_FUNNEL.map((s, i) => {
        const reached = currentIdx >= 0 && i <= currentIdx;
        const isCurrent = i === currentIdx && !isOffRamp;
        return (
          <div key={s} className="flex items-center">
            {i > 0 && <div className={`w-2.5 h-px ${reached ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />}
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isCurrent
                  ? "bg-blue-600 ring-2 ring-blue-200"
                  : reached
                    ? "bg-emerald-400"
                    : "bg-slate-200 dark:bg-slate-700"
              }`}
              title={`${STAGE_DOT_LABEL[s] ?? s}${isCurrent && stageUpdatedAt ? ` · ${fmtDate(stageUpdatedAt)}` : ""}`}
            />
          </div>
        );
      })}
      {isOffRamp && (
        <span
          className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
            stage === "rejected" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
          }`}
        >
          {stage === "rejected" ? "Rejected" : "Pulled back"}
        </span>
      )}
      {!isOffRamp && stageUpdatedAt && (
        <span className="ml-1.5 text-[10px] text-slate-400 whitespace-nowrap">{fmtDate(stageUpdatedAt)}</span>
      )}
      {!isOffRamp &&
        stage !== "placed" &&
        (() => {
          const days = daysSince(stageUpdatedAt);
          const aging = days != null ? agingTone(days) : null;
          return aging ? (
            <span
              title={`${days} days with no stage change -- worth a status check`}
              className={`ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${aging.tone}`}
            >
              {aging.label}
            </span>
          ) : null;
        })()}
    </div>
  );
}
