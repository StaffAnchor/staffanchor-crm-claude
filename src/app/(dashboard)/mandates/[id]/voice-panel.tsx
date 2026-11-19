"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Loader2, Pause, Phone, Play, X } from "lucide-react";
import type { VoiceCandidate } from "@/lib/voice/campaign";
import type { CallPlan, GapKey } from "@/lib/voice/plan";
import type { VoiceOutcome } from "@/lib/voice/read";

export type VoiceCampaignRow = { id: string; name: string; status: string; name_company: boolean; created_at: string; approved_at: string | null };
export type VoiceCall = {
  id: string;
  campaign_id: string;
  candidate_id: string;
  status: string;
  skip_reason: string | null;
  attempts: number;
  plan: CallPlan | null;
  outcome: VoiceOutcome | null;
  applied_at: string | null;
  transcript: string | null;
  candidates: { full_name: string | null } | null;
};

const GAP_LABEL: Record<GapKey, string> = { current_ctc: "current pay", expected_ctc: "expected pay", notice: "notice", relocation: "relocation", city: "city", work_mode: "work mode" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-teal-50 text-teal-800",
  running: "bg-emerald-50 text-emerald-800",
  paused: "bg-amber-50 text-amber-800",
  done: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
};
const CALL_LABEL: Record<string, string> = { queued: "Waiting", dialing: "Dialling", in_progress: "On the call", completed: "Done", no_answer: "No answer", failed: "Failed", skipped: "Skipped", opted_out: "Asked not to be called", test: "Tested" };

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "That didn't work.");
  return j;
};

export default function VoicePanel({ mandateId, roleTitle, companyName, candidates, campaigns, calls, samplePlan, connected, provider, canApprove }: { mandateId: string; roleTitle: string; companyName: string | null; candidates: VoiceCandidate[]; campaigns: VoiceCampaignRow[]; calls: VoiceCall[]; samplePlan: CallPlan | null; connected: boolean; provider: string; canApprove: boolean }) {
  const router = useRouter();
  const eligible = candidates.filter((c) => !c.reason);
  const [picked, setPicked] = useState<Set<string>>(new Set(eligible.map((c) => c.candidateId)));
  const [name, setName] = useState("");
  const [nameCompany, setNameCompany] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const callsBy = useMemo(() => {
    const m = new Map<string, VoiceCall[]>();
    for (const c of calls) (m.get(c.campaign_id) ?? m.set(c.campaign_id, []).get(c.campaign_id)!).push(c);
    return m;
  }, [calls]);
  const ready = calls.filter((c) => c.applied_at && c.outcome?.proposal.interest && c.outcome.proposal.interest.level !== "not_interested");

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-5">
      <div className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 ${connected ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <Phone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 text-[14px]">
          <p className="font-semibold">{connected ? `Voice agent is connected (${provider}).` : "Setup mode: no calls are placed yet."}</p>
          <p className="mt-0.5 opacity-90">{connected ? "Approved campaigns are dialled in calling hours: 10am to 7pm India time, Monday to Saturday." : "You can build campaigns, check the script and test a call by pasting a transcript. Calls start once the voice provider is connected and a campaign is approved."}</p>
        </div>
      </div>

      {msg && <p className={`rounded-lg px-3 py-2 text-[14px] ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`} role="status">{msg.text}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Who the agent can call for {roleTitle}</h3>
        <p className="mt-0.5 text-[13px] text-slate-500">People who applied and are a strong match, with a phone number, who have not opted out and were not called in the last 7 days. Everyone else is shown with the reason.</p>
        {candidates.length === 0 ? (
          <p className="mt-4 text-[14px] text-slate-400">No one in this pipeline yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {candidates.map((c) => (
              <li key={c.candidateId} className={`flex items-center gap-3 py-2 ${c.reason ? "opacity-60" : ""}`}>
                <input type="checkbox" disabled={!!c.reason} checked={!c.reason && picked.has(c.candidateId)} onChange={() => toggle(c.candidateId)} aria-label={`Include ${c.name}`} className="h-4 w-4 accent-teal-600" />
                <span className="min-w-0 flex-1">
                  <span className="text-[14px] font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                  <span className="ml-2 text-[13px] text-slate-500">{c.score != null ? `fit ${Math.round(c.score)}` : "fit not read"}{c.recommendation ? ` · ${c.recommendation}` : ""}</span>
                  <span className="block text-[13px] text-slate-500">{c.reason ? c.reason : c.gaps.length ? `Will ask: ${c.gaps.map((g) => GAP_LABEL[g]).join(", ")}, interest, other offers, interview time` : "Details complete. Will ask interest, other offers, interview time"}</span>
                </span>
                {!c.reason && <Check className="h-4 w-4 text-emerald-600" />}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name (optional)" aria-label="Campaign name" className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[14px] dark:border-slate-700 dark:bg-slate-800" />
          <label className="inline-flex items-center gap-2 text-[14px] text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={nameCompany} disabled={!companyName} onChange={(e) => setNameCompany(e.target.checked)} className="h-4 w-4 accent-teal-600" />
            Name the company on calls{companyName ? ` (${companyName})` : ""}
          </label>
          <button
            type="button"
            disabled={busy !== null || [...picked].filter((id) => eligible.some((e) => e.candidateId === id)).length === 0}
            onClick={() => run("create", async () => {
              const ids = [...picked].filter((id) => eligible.some((e) => e.candidateId === id));
              const j = await post("/api/voice/campaigns", { mandateId, candidateIds: ids, name, nameCompany });
              setName("");
              return `Draft campaign made for ${String(j.queued)} ${Number(j.queued) === 1 ? "person" : "people"}. Check it below, then approve it.`;
            })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-[14px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy === "create" && <Loader2 className="h-4 w-4 animate-spin" />} Make a draft campaign
          </button>
        </div>
      </section>

      {samplePlan && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <button type="button" onClick={() => setShowScript((v) => !v)} className="flex w-full items-center justify-between text-left text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            What the agent will say and ask <span className="text-slate-400">{showScript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
          </button>
          {showScript && (
            <div className="mt-3 space-y-3 text-[14px] text-slate-700 dark:text-slate-300">
              <p><span className="font-semibold">Opening:</span> {samplePlan.opening}</p>
              <ol className="list-decimal space-y-1 pl-5">{samplePlan.questions.map((q) => (<li key={q}>{q}</li>))}</ol>
              <details className="text-[13px] text-slate-500"><summary className="cursor-pointer">The full instructions given to the agent</summary><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-slate-800">{samplePlan.prompt}</pre></details>
              <p className="text-[13px] text-slate-400">Shown for the first person who can be called. Each person&apos;s own call skips the details we already have.</p>
            </div>
          )}
        </section>
      )}

      {campaigns.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Campaigns</h3>
          {campaigns.map((c) => {
            const cc = callsBy.get(c.id) ?? [];
            const count = (s: string) => cc.filter((x) => x.status === s).length;
            return (
              <div key={c.id} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="min-w-0 flex-1 text-[15px] font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium capitalize ${STATUS_STYLE[c.status] ?? STATUS_STYLE.draft}`}>{c.status}</span>
                  <span className="text-[13px] text-slate-500">{count("queued")} waiting · {count("completed") + count("test")} done · {count("skipped") + count("opted_out")} skipped</span>
                  {c.status === "draft" && canApprove && (
                    <button type="button" disabled={busy !== null} onClick={() => run(`ap${c.id}`, async () => { await post(`/api/voice/campaigns/${c.id}`, { action: "approve" }); return "Approved. Calls start in calling hours once the provider is connected."; })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-[13px] font-semibold text-white hover:bg-teal-700"><Play className="h-3.5 w-3.5" /> Approve</button>
                  )}
                  {["approved", "running"].includes(c.status) && (
                    <button type="button" disabled={busy !== null} onClick={() => run(`pa${c.id}`, async () => { await post(`/api/voice/campaigns/${c.id}`, { action: "pause" }); return "Paused."; })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold"><Pause className="h-3.5 w-3.5" /> Pause</button>
                  )}
                  {c.status === "paused" && (
                    <button type="button" disabled={busy !== null} onClick={() => run(`re${c.id}`, async () => { await post(`/api/voice/campaigns/${c.id}`, { action: "resume" }); return "Resumed."; })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold"><Play className="h-3.5 w-3.5" /> Resume</button>
                  )}
                  {!["done", "cancelled"].includes(c.status) && (
                    <button type="button" disabled={busy !== null} onClick={() => run(`ca${c.id}`, async () => { await post(`/api/voice/campaigns/${c.id}`, { action: "cancel" }); return "Cancelled."; })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 px-3 text-[13px] font-semibold text-rose-700"><X className="h-3.5 w-3.5" /> Cancel</button>
                  )}
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cc.map((k) => <CallRow key={k.id} call={k} open={open === k.id} onToggle={() => setOpen(open === k.id ? null : k.id)} busy={busy} run={run} />)}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {ready.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <h3 className="text-[16px] font-semibold text-emerald-900 dark:text-emerald-200">Ready for a recruiter</h3>
          <ul className="mt-2 space-y-1.5 text-[14px] text-emerald-900 dark:text-emerald-100">
            {ready.map((k) => (
              <li key={k.id}><span className="font-medium">{k.candidates?.full_name ?? "Candidate"}</span>: {k.outcome!.proposal.interest!.level.replace("_", " ")}{k.outcome!.extra.callbackTime ? `, best time ${k.outcome!.extra.callbackTime}` : ""}{k.outcome!.extra.interviewAvailability ? `, can interview ${k.outcome!.extra.interviewAvailability}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CallRow({ call, open, onToggle, busy, run }: { call: VoiceCall; open: boolean; onToggle: () => void; busy: string | null; run: (k: string, fn: () => Promise<string>) => Promise<void> }) {
  const [text, setText] = useState(call.transcript ?? "");
  const [outcome, setOutcome] = useState<VoiceOutcome | null>(call.outcome);
  const o = outcome;
  const gaps = call.plan?.gaps ?? [];
  const canTest = !["skipped", "opted_out", "dialing", "in_progress"].includes(call.status) && !call.applied_at;
  return (
    <li className="px-4 py-2.5">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="text-[14px] font-medium text-slate-900 dark:text-slate-100">{call.candidates?.full_name ?? "Candidate"}</span>
          <span className="ml-2 text-[13px] text-slate-500">{CALL_LABEL[call.status] ?? call.status}{call.skip_reason ? `: ${call.skip_reason}` : ""}{call.attempts ? ` · ${call.attempts} ${call.attempts === 1 ? "try" : "tries"}` : ""}</span>
          {call.applied_at && o && <span className="block text-[13px] text-emerald-700">Saved: {[o.proposal.interest ? `interest ${o.proposal.interest.level.replace("_", " ")}` : null, o.extra.inTouchWithClient === "yes" ? "already in touch with the company" : null, o.extra.interviewedByClient === "yes" ? "interviewed there before" : null, o.extra.doNotCall ? "asked not to be called" : null].filter(Boolean).join(" · ") || "summary"}</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-[14px]">
          {gaps.length > 0 && <p className="text-slate-500">Asks: {gaps.map((g) => GAP_LABEL[g]).join(", ")}, interest, other offers, interview time.</p>}
          {canTest && (
            <div className="space-y-2">
              <p className="font-medium text-slate-700 dark:text-slate-200">Test this call: paste what was said (Hindi, Hinglish or English)</p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Call transcript" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-[14px] dark:border-slate-700 dark:bg-slate-800" placeholder="Agent: Hello Rahul, this is StaffAnchor's assistant...&#10;Rahul: Haan, boliye..." />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy !== null || text.trim().length < 20} onClick={() => run(`rd${call.id}`, async () => { const j = (await post(`/api/voice/calls/${call.id}`, { mode: "read", transcript: text })) as { outcome: VoiceOutcome }; setOutcome(j.outcome); return "Read. Check what it took below, then save it."; })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold">{busy === `rd${call.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Read it</button>
                {o && (
                  <button type="button" disabled={busy !== null} onClick={() => run(`sv${call.id}`, async () => { const j = (await post(`/api/voice/calls/${call.id}`, { mode: "apply" })) as { filled: string[] }; return j.filled.length ? `Saved. Filled in: ${j.filled.map((f) => f.replace(/_/g, " ")).join(", ")}.` : "Saved. Nothing needed filling in."; })} className="inline-flex h-8 items-center rounded-lg bg-teal-600 px-3 text-[13px] font-semibold text-white hover:bg-teal-700">Save to the profile</button>
                )}
              </div>
            </div>
          )}
          {o && (
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="font-medium text-slate-800 dark:text-slate-100">What the system took from the call</p>
              {o.proposal.summary && <p className="mt-1 text-slate-600 dark:text-slate-300">{o.proposal.summary}</p>}
              <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                <li>How it went: {o.extra.answered.replace("_", " ")}</li>
                {o.proposal.interest && <li>Interest in the role: {o.proposal.interest.level.replace("_", " ")}{o.proposal.interest.reason ? ` (${o.proposal.interest.reason})` : ""}</li>}
                {Object.entries(o.proposal.fields).map(([k, v]) => (<li key={k}>{k.replace(/_/g, " ")}: {String(v)}</li>))}
                <li>Already in touch with the company: {o.extra.inTouchWithClient}</li>
                <li>Interviewed there before: {o.extra.interviewedByClient}{o.extra.interviewedWhen ? ` (${o.extra.interviewedWhen})` : ""}</li>
                {o.extra.interviewAvailability && <li>Can interview: {o.extra.interviewAvailability}</li>}
                {o.extra.callbackTime && <li>Best time to call: {o.extra.callbackTime}</li>}
                {o.proposal.otherOffers && <li>Other offers: {o.proposal.otherOffers}</li>}
                {o.proposal.dealbreakers.length > 0 && <li>Will not accept: {o.proposal.dealbreakers.join("; ")}</li>}
                {o.extra.doNotCall && <li className="font-medium text-rose-700">Asked not to be called again</li>}
              </ul>
              <p className="mt-2 text-[13px] text-slate-400">Only blanks are filled in. A recruiter still confirms the details before the profile goes to the client.</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
