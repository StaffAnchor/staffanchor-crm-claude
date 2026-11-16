"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Layers, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Role = { id: string; role_title: string | null; client_name: string | null };

// The header shortcut for tagging a candidate to a role. Same write as the dropdown at the bottom of the Roles tab
// (a candidate_mandate_links row), but visible without opening that tab.
export default function AddToRoleButton({ candidateId, candidateName, roles, linkedIds }: { candidateId: string; candidateName: string | null; roles: Role[]; linkedIds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mandateId, setMandateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const linked = new Set(linkedIds);
  const available = roles.filter((r) => !linked.has(r.id));

  function show() {
    setMandateId("");
    setDone(null);
    setErr(null);
    setOpen(true);
  }

  async function add() {
    if (!mandateId) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("candidate_mandate_links").insert({ candidate_id: candidateId, mandate_id: mandateId, added_by: user?.id });
      if (error) {
        setErr("Could not add. Try again.");
      } else {
        const r = roles.find((x) => x.id === mandateId);
        setDone(`Added to ${r?.role_title ?? "the role"}${r?.client_name ? ` at ${r.client_name}` : ""}.`);
        setMandateId("");
        router.refresh();
      }
    } catch {
      setErr("The connection dropped. Try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={show} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
        <Layers className="h-3.5 w-3.5" /> Add to role
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Add {candidateName ?? "this candidate"} to a role</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">Open roles only. They start at the first stage of that role&apos;s pipeline.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            {done && (
              <p className="mt-4 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13.5px] font-medium text-emerald-900">
                <Check className="h-4 w-4" /> {done}
              </p>
            )}
            {available.length === 0 ? (
              <p className="mt-4 text-[13.5px] text-slate-600 dark:text-slate-300">They are already on every open role.</p>
            ) : (
              <>
                <select value={mandateId} onChange={(e) => setMandateId(e.target.value)} className="mt-4 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30">
                  <option value="">Choose a role...</option>
                  {available.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.role_title} — {r.client_name}
                    </option>
                  ))}
                </select>
                {err && <p className="mt-2 text-[12.5px] text-rose-600">{err}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                    {done ? "Done" : "Cancel"}
                  </button>
                  <button type="button" onClick={add} disabled={busy || !mandateId} className="rounded-lg bg-teal-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                    {busy ? "Adding..." : "Add to role"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
