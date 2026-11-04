import type { BoardCandidate } from "./types";
import { passReasonLabel } from "./PassReasonDialog";
import { formatSlot } from "./ui";

// Where a candidate stands, in the words the client sees on the tab, the card chip and the buttons. One place decides it.
export type Status = "new" | "shortlisted" | "interviewing" | "offer" | "selected" | "passed_cv" | "not_selected" | "withdrawn";

const INTERVIEW_STAGES = ["client_interview", "offer"];

export function statusOf(c: BoardCandidate): Status {
  if (c.stage === "placed") return "selected";
  if (c.stage === "offer") return "offer";
  if (c.stage === "pulled_back") return "withdrawn";
  if (c.stage === "rejected") {
    const interviewed = INTERVIEW_STAGES.includes(c.rejected_from_stage ?? "") || !!c.confirmed_interview_at || c.client_feedback === "interview_requested";
    if (interviewed) return "not_selected";
    // Turned down by the client from the CV, or relayed from them by the recruiter. Dropped by the recruiter before the client decided counts as withdrawn.
    if (c.client_feedback === "not_interested" || !!c.client_pass_reason || c.stage_source === "client_relayed") return "passed_cv";
    return "withdrawn";
  }
  if (c.client_feedback === "not_interested") return "passed_cv";
  if (c.client_feedback === "interview_requested" || c.stage === "client_interview" || c.confirmed_interview_at) return "interviewing";
  if (c.client_feedback === "interested" || c.stage === "client_shortlisted") return "shortlisted";
  return "new";
}

export const STATUS_NAME: Record<Status, string> = {
  new: "New for you",
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  offer: "Offer made",
  selected: "Selected",
  passed_cv: "Passed on CV",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

export const STATUS_TONE: Record<Status, string> = {
  new: "border-[#f3d3c7] bg-[#fdf1ec] text-[#c2553a]",
  shortlisted: "border-emerald-200 bg-emerald-50 text-emerald-800",
  interviewing: "border-indigo-200 bg-indigo-50 text-indigo-800",
  offer: "border-violet-200 bg-violet-50 text-violet-800",
  selected: "border-emerald-600 bg-emerald-600 text-white",
  passed_cv: "border-[#e3ddd1] bg-[#f4efe6] text-slate-600",
  not_selected: "border-rose-200 bg-rose-50 text-rose-700",
  withdrawn: "border-dashed border-slate-300 bg-transparent text-slate-500",
};

const dayWord = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

// The small line next to the chip: the date, the reason, or what happens next. Never anything internal.
export function statusDetail(c: BoardCandidate): string | null {
  const s = statusOf(c);
  const reason = passReasonLabel(c.client_pass_reason) ?? passReasonLabel(c.rejection_category);
  if (s === "new") return c.shortlisted_at ? `Shared ${dayWord(c.shortlisted_at)}` : null;
  if (s === "shortlisted") return "You asked to know more";
  if (s === "interviewing") {
    const confirmed = formatSlot(c.confirmed_interview_at);
    const requested = formatSlot(c.requested_interview_at);
    return confirmed ? `Confirmed ${confirmed}` : requested ? `Requested ${requested}` : "Interview being arranged";
  }
  if (s === "offer") return "Offer in progress";
  if (s === "selected") return c.stage_updated_at ? `Hired ${new Date(c.stage_updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Hired";
  if (s === "passed_cv") return reason ? `Reason: ${reason}` : "You passed on this profile";
  if (s === "not_selected") return reason ? `After interview: ${reason}` : "After interview";
  return "Pulled back by StaffAnchor";
}
