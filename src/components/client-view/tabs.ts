import type { BoardCandidate } from "./types";
import { columnOf } from "./fit";
import { STATUS_NAME, statusOf, type Status } from "./status";

// The tabs a client sorts the list by. The words match the chip on each card and the buttons, so one word means one thing.
// Keys stay as they were; only the words changed. "hired" holds Offer made and Selected, "passed" holds everyone not moving forward.
export type Tab = "review" | "interested" | "interview" | "passed" | "hired" | "all";
export const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: "review", label: "New for you", empty: "You are all caught up. New candidates appear here as soon as your recruiter shares them." },
  { key: "interested", label: "Shortlisted", empty: "No one here yet. Press Shortlist on a candidate you would like to know more about." },
  { key: "interview", label: "Interviewing", empty: "No interviews yet. Press Interview on a candidate and your recruiter will schedule it." },
  { key: "hired", label: "Selected", empty: "No one selected yet." },
  { key: "passed", label: "Not moving forward", empty: "No one here. People you pass on, or who are not selected after an interview, appear here." },
  { key: "all", label: "Insights", empty: "No candidates yet." },
];
const TAB_OF_STATUS: Record<Status, Exclude<Tab, "all">> = { new: "review", shortlisted: "interested", interviewing: "interview", offer: "hired", selected: "hired", passed_cv: "passed", not_selected: "passed", withdrawn: "passed" };
export const tabOf = (c: BoardCandidate): Exclude<Tab, "all"> => TAB_OF_STATUS[statusOf(c)];
export const STATUS_LABEL = (c: BoardCandidate) => STATUS_NAME[statusOf(c)];
export const isNew = (c: BoardCandidate) => columnOf(c) === "review" && !!c.shortlisted_at && Date.now() - new Date(c.shortlisted_at).getTime() < 3 * 86_400_000;


// The colour each tab wears, so the open tab is unmistakable: the underline, the count and the banner under the bar all use it.
export const TAB_LOOK: Record<Tab, { dot: string; ink: string; soft: string; line: string; title: string }> = {
  review: { dot: "bg-[#e8896a]", ink: "text-[#c2553a]", soft: "bg-[#fdf1ec]", line: "border-[#e8896a]", title: "Waiting for your decision" },
  interested: { dot: "bg-emerald-500", ink: "text-emerald-700", soft: "bg-emerald-50", line: "border-emerald-500", title: "People you shortlisted" },
  interview: { dot: "bg-indigo-500", ink: "text-indigo-700", soft: "bg-indigo-50", line: "border-indigo-500", title: "Interviews in motion" },
  passed: { dot: "bg-rose-500", ink: "text-rose-700", soft: "bg-rose-50", line: "border-rose-500", title: "Not moving forward" },
  hired: { dot: "bg-amber-500", ink: "text-amber-700", soft: "bg-amber-50", line: "border-amber-500", title: "Selected" },
  all: { dot: "bg-slate-700", ink: "text-slate-800", soft: "bg-[#f4efe6]", line: "border-slate-800", title: "The whole shortlist at a glance" },
};
