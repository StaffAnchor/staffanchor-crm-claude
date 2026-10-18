"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Person = { id: string; full_name: string | null; email: string | null; phone: string | null; source: string | null; created_at: string; has_cv: boolean; current_job_title: string | null; current_employer: string | null; links: number; msgs: number; has_account: boolean };
export type Group = { key: string; people: Person[] };

// The most complete profile is the suggested one to keep: has a CV, applications, chats, a sign-in account.
const score = (p: Person) => (p.has_cv ? 3 : 0) + p.links * 2 + (p.msgs > 0 ? 1 : 0) + (p.has_account ? 2 : 0) + (p.current_employer ? 1 : 0);

export default function DuplicatesView({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const suggested = (g: Group) => [...g.people].sort((a, b) => score(b) - score(a) || a.created_at.localeCompare(b.created_at))[0].id;

  async function act(url: string, key: string, body: Record<string, unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) return setMsg(d.error ?? "That didn't work.");
    setMsg(ok);
    router.refresh();
  }

  if (groups.length === 0) return <p className="mt-6 text-sm text-slate-500">No duplicates found. Profiles that look the same will appear here.</p>;
  return (
    <div className="mt-5 space-y-4">
      {msg && <p className="text-sm text-slate-700 dark:text-slate-200">{msg}</p>}
      <p className="text-[13px] text-slate-500">{groups.length} group{groups.length === 1 ? "" : "s"} to review.</p>
      {groups.map((g) => {
        const chosen = keep[g.key] ?? suggested(g);
        return (
          <section key={g.key} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.key.startsWith("phone:") ? `Same mobile ${g.key.slice(6)}` : `Same email ${g.key.slice(6)}`}</p>
            <ul className="space-y-2">
              {g.people.map((p) => (
                <li key={p.id}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-[13px] ${chosen === p.id ? "border-teal-500 bg-teal-50/60 dark:bg-teal-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                    <input type="radio" name={g.key} checked={chosen === p.id} onChange={() => setKeep((k) => ({ ...k, [g.key]: p.id }))} className="mt-1" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{p.full_name ?? "Unnamed"}</span>{" "}
                      <Link href={`/candidates/${p.id}`} target="_blank" className="text-xs text-teal-700 hover:underline">open</Link>
                      <span className="block text-xs text-slate-500">{[p.email, p.phone].filter(Boolean).join(" · ")}</span>
                      <span className="block text-xs text-slate-500">
                        {[p.current_job_title, p.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                        {` · ${p.has_cv ? "has CV" : "no CV"} · ${p.links} application${p.links === 1 ? "" : "s"} · ${p.msgs} message${p.msgs === 1 ? "" : "s"}${p.has_account ? " · has sign-in" : ""} · ${p.source ?? "unknown source"}`}
                      </span>
                    </span>
                    {chosen === p.id && <span className="text-xs font-semibold text-teal-700">Keep</span>}
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy === g.key}
                onClick={() => act("/api/admin/duplicates/merge", g.key, { keep: chosen, drop: g.people.filter((p) => p.id !== chosen).map((p) => p.id) }, "Merged.")}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
              >
                {busy === g.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Merge into the one marked Keep
              </button>
              <button type="button" disabled={busy === g.key} onClick={() => act("/api/admin/duplicates/dismiss", g.key, { key: g.key }, "Marked as different people.")} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Not the same person
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
