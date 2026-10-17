"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Megaphone, Sparkles, Undo2, EyeOff } from "lucide-react";

export type PipelineRow = {
  id: string;
  role_title: string;
  city: string | null;
  status: string;
  created_at: string;
  experience: string | null;
  sub_domain: string | null;
  link: string | null;
  post: string | null;
  copied: boolean;
  applicants: number;
  visits: number;
  registrations: number;
  applications: number;
};

export type SourceRow = { source: string; visits: number; registrations: number; applications: number; progressed: number; placed: number };

export default function MarketingClient({ rows, sources }: { rows: PipelineRow[]; sources: SourceRow[] }) {
  const router = useRouter();
  const [count, setCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // A link for any post, not only role posts: pick where it lands and name the post, and it carries its source.
  const [dest, setDest] = useState("/jobs");
  const [camp, setCamp] = useState("");
  const [custom, setCustom] = useState<string | null>(null);
  function buildLink() {
    const slug = camp.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) return setCustom(null);
    setCustom(`https://jobs.staffanchor.com${dest}?utm_source=linkedin&utm_medium=social&utm_campaign=${slug}`);
  }

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/marketing/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Could not generate roles.");
      setMsg(`${json.created} pipeline roles are live with their LinkedIn posts below.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not generate roles.");
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: "takedown" | "restore" | "copied", mandateId: string) {
    await fetch("/api/admin/marketing/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, mandateId }) });
    router.refresh();
  }

  async function copy(r: PipelineRow) {
    if (!r.post) return;
    try {
      await navigator.clipboard.writeText(r.post);
      setCopiedId(r.id);
      setTimeout(() => setCopiedId((c) => (c === r.id ? null : c)), 1800);
      void act("copied", r.id);
    } catch {
      setMsg("Copy was blocked by the browser. Select the text and copy it.");
    }
  }

  const live = rows.filter((r) => r.status === "open");
  const down = rows.filter((r) => r.status !== "open");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white">
          <Megaphone className="h-5 w-5" />
        </span>
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Marketing</h1>
          <p className="text-sm text-slate-500">Pipeline roles and LinkedIn posts. Only you can see this page.</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">Where candidates come from, last 30 days</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Visits are counted from when tracking went live. &quot;Untracked&quot; rows are people who registered before then, or through an import.
        </p>
        {sources.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing recorded yet. Visits, registrations and applications appear here as they happen.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-medium">Source</th>
                  <th className="py-1 text-right font-medium">Visits</th>
                  <th className="py-1 text-right font-medium">Registered</th>
                  <th className="py-1 text-right font-medium">Applied</th>
                  <th className="py-1 text-right font-medium">Moved forward</th>
                  <th className="py-1 text-right font-medium">Placed</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((r) => (
                  <tr key={r.source} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 capitalize">{r.source}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.visits || "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.registrations || "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.applications || "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.progressed || "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.placed || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <h3 className="text-sm font-semibold">Tracked link for any LinkedIn post</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-800">
              <option value="/jobs">Jobs list</option>
              <option value="/">Home page</option>
              <option value="/register">Create profile</option>
            </select>
            <input value={camp} onChange={(e) => setCamp(e.target.value)} placeholder="Name this post, e.g. salary-pune-oct" className="h-9 min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800" />
            <button type="button" onClick={buildLink} className="h-9 rounded-lg bg-teal-600 px-3 text-sm font-semibold text-white hover:bg-teal-700">
              Make link
            </button>
          </div>
          {custom && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800">
              <span className="break-all">{custom}</span>
              <button type="button" onClick={() => navigator.clipboard.writeText(custom).catch(() => {})} className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:underline">
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-teal-600" /> Generate pipeline roles
        </h2>
        <p className="mt-1 text-[13px] leading-6 text-slate-500">
          Drafts B2B SaaS, AI and tech-sales roles for the top metros, publishes them to jobs.staffanchor.com with a &quot;Pipeline role&quot; label (no client named, no pay figure), and writes a short LinkedIn post with the apply link for each. You copy and post them yourself.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800">
            {[5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} roles
              </option>
            ))}
          </select>
          <button onClick={generate} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Writing and publishing…" : "Generate, publish and write posts"}
          </button>
          {msg && <span className="text-sm text-slate-600 dark:text-slate-300">{msg}</span>}
        </div>
      </section>

      {live.length === 0 && down.length === 0 && <p className="text-sm text-slate-500">No pipeline roles yet. Use the button above.</p>}

      <div className="space-y-4">
        {live.map((r) => (
          <article key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-start gap-3">
              <div className="mr-auto min-w-0">
                <h3 className="text-[15px] font-semibold">{r.role_title}</h3>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  {[r.city, r.experience, r.sub_domain].filter(Boolean).join(" · ")} · {r.visits} visits · {r.registrations} registered · {r.applicants} applied
                </p>
              </div>
              {r.link && (
                <a href={r.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-teal-700 hover:underline">
                  Open listing <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button onClick={() => act("takedown", r.id)} className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-red-600">
                <EyeOff className="h-3.5 w-3.5" /> Take down
              </button>
            </div>
            {r.post && (
              <div className="mt-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                <p className="whitespace-pre-wrap text-[13.5px] leading-6">{r.post}</p>
                <button onClick={() => copy(r)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900">
                  {copiedId === r.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copiedId === r.id ? "Copied" : r.copied ? "Copy again" : "Copy post"}
                </button>
                {r.copied && copiedId !== r.id && <span className="ml-3 text-xs text-slate-400">Copied before</span>}
              </div>
            )}
          </article>
        ))}
      </div>

      {down.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Taken down</h2>
          <div className="space-y-2">
            {down.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <span className="mr-auto">
                  {r.role_title} · {r.city}
                </span>
                <button onClick={() => act("restore", r.id)} className="inline-flex items-center gap-1 text-[13px] font-medium text-teal-700 hover:underline">
                  <Undo2 className="h-3.5 w-3.5" /> Bring back
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
