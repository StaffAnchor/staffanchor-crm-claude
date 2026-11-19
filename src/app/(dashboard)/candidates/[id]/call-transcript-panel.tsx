"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2, Sparkles } from "lucide-react";
import type { CallProposal } from "@/lib/call-transcript";

type Change = { key: string; label: string; current: string | number | null; next: string | number; kind: "new" | "changed"; defaultOn: boolean };
type Reading = { insightId: string; proposal: CallProposal; changes: Change[] };
type Fit = { mandateId: string; roleTitle: string; clientName: string | null; bucket: string; score: number; why: string };
type Role = { id: string; role_title: string; client_name: string | null };

const SEGMENT_LABEL: Record<string, string> = {
  reason_for_change: "Why looking",
  interviewing_elsewhere: "Interviewing elsewhere",
  notice_flex: "Notice flexibility",
  expected_ctc_negotiable: "Pay negotiable",
  carries_quota: "Carries quota",
  quota_last_year: "Quota last year",
  style: "Selling style",
  cycle: "Sales cycle",
  best_time_to_call: "Best time to call",
  can_refer: "Can refer others",
};

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

// Paste what was said on a call and turn it into profile details: the person checks what was read, then applies it. The
// same reading will take the voice agent's transcript later.
export default function CallTranscriptPanel({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState("");
  const [reading, setReading] = useState<Reading | null>(null);
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [fieldOn, setFieldOn] = useState<Set<string>>(new Set());
  const [on, setOn] = useState({ segment: true, ratings: true, messageOk: true, openness: true, selling: true, interest: true, notes: true });
  const [done, setDone] = useState<{ fits: Fit[]; filled: string[]; stillMissing: string[] } | null>(null);

  useEffect(() => {
    if (!open || roles.length) return;
    void createClient()
      .from("mandates")
      .select("id, role_title, client_name")
      .eq("status", "open")
      .order("role_title")
      .then(({ data }) => setRoles((data ?? []) as Role[]));
  }, [open, roles.length]);

  async function read() {
    setBusy("read");
    setError("");
    setDone(null);
    try {
      const res = await fetch("/api/calls/transcript", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "read", candidateId, transcript: text, mandateId: roleId || null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't read that call.");
      setReading(j as Reading);
      setFieldOn(new Set((j.changes as Change[]).filter((c) => c.defaultOn).map((c) => c.key)));
      setOn({ segment: true, ratings: true, messageOk: true, openness: true, selling: true, interest: true, notes: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that call.");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!reading) return;
    setBusy("apply");
    setError("");
    try {
      const res = await fetch("/api/calls/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", candidateId, insightId: reading.insightId, accept: { fields: Array.from(fieldOn), ...on } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't save to the profile.");
      setDone({ fits: j.fits ?? [], filled: j.filled ?? [], stillMissing: j.stillMissing ?? [] });
      setReading(null);
      setText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save to the profile.");
    } finally {
      setBusy(null);
    }
  }

  const p = reading?.proposal;
  const segEntries = p ? Object.entries(p.segment).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)) : [];
  const ratingEntries = p ? Object.entries(p.ratings) : [];
  const roleName = roles.find((r) => r.id === roleId)?.role_title;
  const row = "flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800/50";

  return (
    <div className="rounded-ros-lg border border-slate-200 dark:border-slate-700">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-semibold text-slate-900 dark:text-slate-100">
        <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-teal-600" /> Read a call <span className="font-normal text-slate-500">(paste a transcript or your notes)</span></span>
        <span className="text-slate-400">{open ? "Hide" : "Open"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
          {done && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[13px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
              <p className="flex items-center gap-1.5 font-semibold"><Check className="h-4 w-4" /> Saved to the profile.</p>
              {done.filled.length > 0 && <p className="mt-0.5">Updated: {done.filled.join(", ").replace(/_/g, " ")}.</p>}
              {done.stillMissing.length > 0 && <p className="mt-0.5">Still missing: {done.stillMissing.join(", ")}.</p>}
              {done.fits.length > 0 ? (
                <div className="mt-1.5">
                  <p className="font-medium">Now fits these open roles:</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {done.fits.map((f) => (
                      <li key={f.mandateId}>{f.roleTitle}{f.clientName ? ` (${f.clientName})` : ""}: {f.bucket}{f.why ? `, ${f.why}` : ""}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-0.5">No open role fits yet. The matcher will pick them up as roles open.</p>
              )}
            </div>
          )}

          {!reading && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder="Paste the call transcript, or type what the candidate told you: pay, notice, location, what they sell, why they are looking, what they want and won't accept."
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-[14px] dark:bg-slate-900"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-[13px] dark:bg-slate-900">
                  <option value="">The call was not about one role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.role_title}{r.client_name ? ` — ${r.client_name}` : ""}</option>
                  ))}
                </select>
                <button onClick={read} disabled={busy !== null || text.trim().length < 40} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                  {busy === "read" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {busy === "read" ? "Reading…" : "Read the call"}
                </button>
              </div>
            </>
          )}

          {p && reading && (
            <div className="space-y-2.5">
              {p.summary && <p className="rounded-lg bg-teal-50/60 px-3 py-2 text-[13px] text-slate-700 dark:bg-teal-950/20 dark:text-slate-200">{p.summary}</p>}
              <p className="text-[13px] text-slate-500">Untick anything that is wrong, then apply. Nothing is saved until you do.</p>

              {reading.changes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">Profile details</p>
                  {reading.changes.map((c) => (
                    <label key={c.key} className={row}>
                      <input type="checkbox" className="mt-0.5" checked={fieldOn.has(c.key)} onChange={(e) => setFieldOn((s) => { const n = new Set(s); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} />
                      <span className="flex-1"><b>{c.label}</b>: {c.current !== null && c.current !== "" ? <><s className="text-slate-400">{String(c.current)}</s> → </> : null}<b>{String(c.next)}</b></span>
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${c.kind === "new" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{c.kind === "new" ? "New" : "Changes"}</span>
                    </label>
                  ))}
                </div>
              )}

              {(segEntries.length > 0 || ratingEntries.length > 0 || p.messageOk !== null || p.openness || p.selling || (p.interest && roleId)) && (
                <div className="space-y-1.5">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">Also from the call</p>
                  {segEntries.length > 0 && (
                    <label className={row}><input type="checkbox" className="mt-0.5" checked={on.segment} onChange={(e) => setOn({ ...on, segment: e.target.checked })} />
                      <span><b>Quick answers:</b> {segEntries.map(([k, v]) => `${SEGMENT_LABEL[k] ?? k}: ${show(v)}`).join(" · ")}</span></label>
                  )}
                  {ratingEntries.length > 0 && (
                    <label className={row}><input type="checkbox" className="mt-0.5" checked={on.ratings} onChange={(e) => setOn({ ...on, ratings: e.target.checked })} />
                      <span><b>How they came across:</b> {ratingEntries.map(([k, v]) => `${k}: ${v}`).join(" · ")}</span></label>
                  )}
                  {p.messageOk !== null && (
                    <label className={row}><input type="checkbox" className="mt-0.5" checked={on.messageOk} onChange={(e) => setOn({ ...on, messageOk: e.target.checked })} />
                      <span><b>Contact about roles:</b> {p.messageOk ? "agreed (WhatsApp and email on)" : "declined (WhatsApp and email off)"}</span></label>
                  )}
                  {p.openness && (
                    <label className={row}><input type="checkbox" className="mt-0.5" checked={on.openness} onChange={(e) => setOn({ ...on, openness: e.target.checked })} />
                      <span><b>Openness:</b> {p.openness === "Looking" ? "actively looking" : "not now (paused for 90 days)"}</span></label>
                  )}
                  {p.selling && (
                    <label className={row}><input type="checkbox" className="mt-0.5" checked={on.selling} onChange={(e) => setOn({ ...on, selling: e.target.checked })} />
                      <span><b>What they sell:</b> {[p.selling.sells, p.selling.motion && `way of selling: ${p.selling.motion}`, p.selling.customer_types.length ? `to ${p.selling.customer_types.join(", ")}` : null, p.selling.deal_size && `deal size ${p.selling.deal_size}`, p.selling.team_size && `team of ${p.selling.team_size}`].filter(Boolean).join(" · ")}</span></label>
                  )}
                  {p.interest && roleId && (
                    <label className={row}><input type="checkbox" className="mt-0.5" checked={on.interest} onChange={(e) => setOn({ ...on, interest: e.target.checked })} />
                      <span><b>{roleName ?? "This role"}:</b> {p.interest.level.replace("_", " ")}{p.interest.reason ? `, ${p.interest.reason}` : ""}</span></label>
                  )}
                </div>
              )}

              {(p.dealbreakers.length > 0 || p.preferred.length > 0 || p.otherOffers || p.unclear.length > 0) && (
                <label className={row}><input type="checkbox" className="mt-0.5" checked={on.notes} onChange={(e) => setOn({ ...on, notes: e.target.checked })} />
                  <span className="space-y-0.5">
                    <b>Keep for next time:</b>
                    {p.dealbreakers.length > 0 && <span className="block">Will not accept: {p.dealbreakers.join("; ")}</span>}
                    {p.preferred.length > 0 && <span className="block">Wants: {p.preferred.join("; ")}</span>}
                    {p.otherOffers && <span className="block">Other offers: {p.otherOffers}</span>}
                    {p.unclear.length > 0 && <span className="block text-amber-700 dark:text-amber-300">Still unclear: {p.unclear.join("; ")}</span>}
                  </span></label>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button onClick={apply} disabled={busy !== null} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                  {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {busy === "apply" ? "Saving…" : "Apply to profile"}
                </button>
                <button onClick={() => setReading(null)} disabled={busy !== null} className="text-[13px] text-slate-500 hover:text-slate-800">Back</button>
              </div>
            </div>
          )}
          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
