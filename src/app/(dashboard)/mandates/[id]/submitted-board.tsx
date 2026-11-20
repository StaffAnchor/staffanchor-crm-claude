"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, Clock, Loader2, Send, ThumbsDown, ThumbsUp, Trophy, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { applyStageChange, type Stage } from "@/lib/mandate-stage";
import { passReasonLabel } from "@/lib/pass-reasons";
import PlacedDateModal from "./placed-date-modal";
import PullBackDialog from "./pull-back-dialog";
import { pullBackFromClient } from "@/lib/pull-back";

export type SubmittedRow = {
  id: string;
  candidateId: string;
  name: string;
  headline: string;
  stage: string;
  inShortlist: boolean;
  clientFeedback: string | null;
  passReason: string | null;
  passNote: string | null;
  decisionAt: string | null;
  sharedAt: string | null;
  joiningDate: string | null;
};

type Pile = "waiting" | "shortlisted" | "interview" | "offer" | "placed" | "passed" | "pulled";

const PILES: { key: Pile; title: string; hint: string; icon: typeof Clock; tone: string }[] = [
  { key: "waiting", title: "Waiting for the client", hint: "Shared, no answer yet", icon: Clock, tone: "text-amber-700 bg-amber-50" },
  { key: "shortlisted", title: "Client shortlisted", hint: "They want to take it further", icon: ThumbsUp, tone: "text-emerald-700 bg-emerald-50" },
  { key: "interview", title: "In interviews", hint: "Interview asked for or happening", icon: CalendarCheck, tone: "text-cyan-700 bg-cyan-50" },
  { key: "offer", title: "Offer made", hint: "Waiting for them to accept and join", icon: Send, tone: "text-lime-700 bg-lime-50" },
  { key: "placed", title: "Placed", hint: "Joining date set", icon: Trophy, tone: "text-green-700 bg-green-50" },
  { key: "passed", title: "Client passed", hint: "With the reason they gave", icon: ThumbsDown, tone: "text-rose-700 bg-rose-50" },
  { key: "pulled", title: "Pulled back, still visible", hint: "Marked withdrawn, but the client can still open them", icon: Undo2, tone: "text-amber-700 bg-amber-50" },
];

function pileOf(r: SubmittedRow): Pile {
  if (r.stage === "pulled_back") return "pulled";
  if (r.stage === "placed") return "placed";
  if (r.stage === "offer") return "offer";
  if (r.stage === "client_interview" || r.stage === "client_shortlisted") return "interview";
  if (r.stage === "rejected" || r.clientFeedback === "not_interested") return "passed";
  if (r.clientFeedback === "interested") return "shortlisted";
  return "waiting";
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);

// Where each shared person stands with the client, in plain piles, with the one next step for each.
export default function SubmittedBoard({ mandateId, mandateLabel, clientName = "the client", rows }: { mandateId: string; mandateLabel: string; clientName?: string; rows: SubmittedRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dojRow, setDojRow] = useState<SubmittedRow | null>(null);
  const [pullRow, setPullRow] = useState<SubmittedRow | null>(null);

  async function move(r: SubmittedRow, to: Stage, dateOfJoining?: string) {
    setBusyId(r.id);
    setError(null);
    try {
      await applyStageChange(createClient(), { linkId: r.id, candidateId: r.candidateId, mandateId, candidateName: r.name, mandateLabel, previousStage: r.stage, newStage: to, source: "recruiter", dateOfJoining, existingDateOfJoining: r.joiningDate });
      setDojRow(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusyId(null);
    }
  }

  async function pull(r: SubmittedRow) {
    await pullBackFromClient(createClient(), { linkId: r.id, candidateId: r.candidateId, mandateId, candidateName: r.name, mandateLabel, stage: r.stage, existingDateOfJoining: r.joiningDate });
    setPullRow(null);
    router.refresh();
  }

  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold disabled:opacity-50";
  function action(r: SubmittedRow, pile: Pile) {
    const busy = busyId === r.id;
    const spin = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null;
    const pullBtn = (
      <button type="button" disabled={busy} onClick={() => setPullRow(r)} className={`${btn} border border-amber-300 text-amber-800 hover:bg-amber-50`} title="Take this person off the client's screen">
        <Undo2 className="h-3.5 w-3.5" /> Pull back
      </button>
    );
    if (pile === "waiting") return pullBtn;
    if (pile === "shortlisted") return <div className="flex flex-wrap gap-2">{pullBtn}<button type="button" disabled={busy} onClick={() => void move(r, "client_interview")} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>{spin ?? <CalendarCheck className="h-3.5 w-3.5" />} Interview is on</button></div>;
    if (pile === "interview") return <div className="flex flex-wrap gap-2">{pullBtn}<button type="button" disabled={busy} onClick={() => void move(r, "offer")} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>{spin ?? <Send className="h-3.5 w-3.5" />} Offer made</button></div>;
    if (pile === "offer") return <button type="button" disabled={busy} onClick={() => setDojRow(r)} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>{spin ?? <Trophy className="h-3.5 w-3.5" />} Placed: add joining date</button>;
    if (pile === "placed") return <button type="button" onClick={() => setDojRow(r)} className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50`}>Change date</button>;
    if (pile === "pulled") return <button type="button" disabled={busy} onClick={() => setPullRow(r)} className={`${btn} bg-amber-600 text-white hover:bg-amber-700`} title="Switch off the client's access to this person completely"><Undo2 className="h-3.5 w-3.5" /> Hide from the client completely</button>;
    return null;
  }

  const shown = PILES.map((p) => ({ ...p, items: rows.filter((r) => pileOf(r) === p.key) })).filter((p) => p.items.length > 0);
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-[15px] text-slate-500 dark:border-slate-700">Nobody has been shared with the client yet. Share people from the Pipeline or Matches tab and they appear here.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-7">
        {PILES.map((p) => {
          const n = rows.filter((r) => pileOf(r) === p.key).length;
          return (
            <a key={p.key} href={`#pile-${p.key}`} className={`rounded-xl px-3 py-2.5 ${n ? "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60" : "bg-slate-50/50 opacity-60 dark:bg-slate-800/30"}`}>
              <p className="text-[22px] font-semibold leading-7 tabular-nums text-slate-900 dark:text-slate-100">{n}</p>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">{p.title}</p>
            </a>
          );
        })}
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-700">{error}</p>}
      {shown.map((p) => (
        <section key={p.key} id={`pile-${p.key}`} className="scroll-mt-24">
          <h3 className="mb-2 flex items-center gap-2 text-[16px] font-semibold text-slate-900 dark:text-slate-100">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${p.tone}`}><p.icon className="h-4 w-4" /></span>
            {p.title} <span className="text-slate-400">{p.items.length}</span>
            <span className="text-[13px] font-normal text-slate-400">{p.hint}</span>
          </h3>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {p.items.map((r) => {
              const waited = p.key === "waiting" ? daysAgo(r.sharedAt) : null;
              const reason = passReasonLabel(r.passReason);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-[200px] flex-1">
                    <Link href={`/candidates/${r.candidateId}`} target="_blank" className="text-[14.5px] font-semibold text-slate-900 hover:underline dark:text-slate-100">{r.name}</Link>
                    <p className="truncate text-[13px] text-slate-500">{r.headline}</p>
                  </div>
                  <div className="min-w-[180px] text-[14px] text-slate-600 dark:text-slate-300">
                    {p.key === "waiting" && <span className={waited != null && waited >= 4 ? "font-medium text-amber-700" : ""}>Shared {waited === 0 ? "today" : waited != null ? `${waited}d ago` : ""}{waited != null && waited >= 4 ? ". Follow up." : ""}</span>}
                    {p.key === "shortlisted" && <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3.5 w-3.5" /> Shortlisted {fmt(r.decisionAt)}</span>}
                    {p.key === "interview" && <span>In interviews</span>}
                    {p.key === "offer" && <span>Offer made. Joining date not set.</span>}
                    {p.key === "placed" && <span className="font-medium text-green-700">Joining {r.joiningDate ? new Date(r.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "date not set"}</span>}
                    {p.key === "pulled" && <span className="text-amber-700">The client sees them as withdrawn.</span>}
                    {p.key === "passed" && <span className="text-rose-700"><strong>{reason ?? "No reason given"}</strong>{r.passNote ? `. “${r.passNote}”` : ""}{r.decisionAt ? ` · ${fmt(r.decisionAt)}` : ""}</span>}
                  </div>
                  <div className="ml-auto">{action(r, p.key)}</div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {pullRow && <PullBackDialog candidateName={pullRow.name} clientName={clientName} clientReacted={!!pullRow.clientFeedback || ["client_interview", "client_shortlisted"].includes(pullRow.stage)} onCancel={() => setPullRow(null)} onConfirm={() => pull(pullRow)} />}
      {dojRow && <PlacedDateModal candidateName={dojRow.name} initialDate={dojRow.joiningDate ?? ""} busy={busyId === dojRow.id} onCancel={() => setDojRow(null)} onConfirm={(d) => void move(dojRow, "placed", d)} />}
    </div>
  );
}
