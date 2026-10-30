"use client";

import { useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Person = { id: string; name: string };
type RoleOption = { id: string; label: string };

// "Recommend to a colleague": pick the recruiter and the role, add a note, and it lands in her Recommended page (and her
// bell). Use it from a candidate's profile or from inside a role's pipeline.
export default function RecommendDialog({
  candidateId,
  candidateName,
  defaultMandateId,
  className,
  label = "Recommend to a recruiter",
}: {
  candidateId: string;
  candidateName: string;
  defaultMandateId?: string;
  className?: string;
  label?: string;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [toUser, setToUser] = useState("");
  const [mandateId, setMandateId] = useState(defaultMandateId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setDone(null);
    setErr(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [{ data: ppl }, { data: rls }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("role", ["admin", "recruiter", "partner"]).order("full_name"),
      supabase.from("mandates").select("id, role_title, client_name").eq("status", "open").eq("is_archived", false).order("created_at", { ascending: false }).limit(200),
    ]);
    const others = ((ppl ?? []) as { id: string; full_name: string | null; email: string }[]).filter((p) => p.id !== user?.id).map((p) => ({ id: p.id, name: p.full_name?.trim() || p.email }));
    setPeople(others);
    if (others.length === 1) setToUser(others[0].id);
    setRoles(((rls ?? []) as { id: string; role_title: string | null; client_name: string | null }[]).map((m) => ({ id: m.id, label: `${m.role_title ?? "Role"}${m.client_name ? ` · ${m.client_name}` : ""}` })));
  }

  async function send() {
    setBusy(true);
    setErr(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("candidate_recommendations").insert({ candidate_id: candidateId, mandate_id: mandateId, from_user: user?.id, to_user: toUser, note: note.trim() || null });
    setBusy(false);
    if (error) {
      setErr(error.code === "23505" ? "Already recommended to them for this role, and they haven't acted on it yet." : error.message);
      return;
    }
    setDone(people.find((p) => p.id === toUser)?.name ?? "them");
  }

  return (
    <>
      <button type="button" onClick={show} className={className ?? "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}>
        <Send className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Recommend {candidateName}</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">It goes to their Recommended page and their bell.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            {done ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[14px] text-emerald-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Check className="h-4 w-4" /> Sent to {done}
                </p>
                <p className="mt-1 text-[13px]">They&apos;ll see it in Recommended and get a bell notification.</p>
                <button type="button" onClick={() => setOpen(false)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-[13px] font-medium text-white">Done</button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-300">
                  Recruiter
                  <select value={toUser} onChange={(e) => setToUser(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900">
                    <option value="">Choose a recruiter…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-300">
                  For which role
                  <select value={mandateId} onChange={(e) => setMandateId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900">
                    <option value="">Choose a role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-300">
                  Why you like them (optional)
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. Sold to CISOs for 6 years, wants Pune, call her first" className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900" />
                </label>
                {err && <p className="text-[13px] text-rose-600">{err}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                  <button type="button" onClick={send} disabled={busy || !toUser || !mandateId} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-teal-500 disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
