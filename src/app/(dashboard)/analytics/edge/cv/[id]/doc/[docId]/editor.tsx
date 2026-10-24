"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Flag } from "@/lib/cv-doc/checks";
import { EDITABLE, STATUS_LABEL, sections, type CandidateResponse, type CvDoc, type CvExp, type DocStatus } from "@/lib/cv-doc/types";

const INP = "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900";
const LBL = "mb-1 block text-xs font-medium text-slate-500";
const BTN = "rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800";
const PRIMARY = "rounded-lg bg-teal-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50";

const STATUS_CLS: Record<DocStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  in_review: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  shared: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  changes_requested: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  final: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const rid = () => Math.random().toString(36).slice(2, 10);

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** A list of lines (achievements, highlights) that can be reworded, reordered, removed and added to. */
function Lines({ items, onChange, disabled, placeholder }: { items: string[]; onChange: (v: string[]) => void; disabled: boolean; placeholder?: string }) {
  const move = (i: number, by: -1 | 1) => {
    const to = i + by;
    if (to < 0 || to >= items.length) return;
    const n = [...items];
    [n[i], n[to]] = [n[to], n[i]];
    onChange(n);
  };
  return (
    <div className="space-y-2">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <textarea disabled={disabled} rows={2} className={INP} value={t} placeholder={placeholder} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
          {!disabled && (
            <div className="flex shrink-0 flex-col text-slate-400">
              <button type="button" onClick={() => move(i, -1)} aria-label="Move up" className="px-1.5 hover:text-slate-700">↑</button>
              <button type="button" onClick={() => move(i, 1)} aria-label="Move down" className="px-1.5 hover:text-slate-700">↓</button>
              <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Remove" className="px-1.5 hover:text-red-600">×</button>
            </div>
          )}
        </div>
      ))}
      {!disabled && <button type="button" onClick={() => onChange([...items, ""])} className="text-[13px] font-medium text-teal-700 hover:underline dark:text-teal-400">+ Add a line</button>}
    </div>
  );
}

export default function DocEditor(props: {
  briefId: string; docId: string; name: string; version: number; status: DocStatus; initial: CvDoc; initialFlags: Flag[]; polishNote: string | null;
  versions: { id: string; version: number; status: DocStatus }[]; sources: Record<string, string[]>; to: string; shareMessage: string; reviewUrl: string | null;
  sharedTo: string | null; sharedAt: string | null; approvedBy: string | null; response: CandidateResponse | null; hasPhoto: boolean; photoPref: string;
}) {
  const router = useRouter();
  const { briefId, docId } = props;
  const [doc, setDoc] = useState<CvDoc>(props.initial);
  const [flags, setFlags] = useState<Flag[]>(props.initialFlags);
  const [status, setStatus] = useState<DocStatus>(props.status);
  const [save, setSave] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [reviewUrl, setReviewUrl] = useState(props.reviewUrl);
  const first = useRef(true);
  const latest = useRef(doc);
  latest.current = doc;
  const editable = EDITABLE.includes(status);
  const warns = flags.filter((f) => f.level === "warn");

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!editable) return;
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        const res = await fetch(`/api/admin/cv-docs/${docId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: latest.current }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "save failed");
        setFlags(j.flags ?? []);
        if (j.status) setStatus(j.status);
        setSave("saved");
        setTimeout(() => setPreviewKey((k) => k + 1), 400);
      } catch {
        setSave("error");
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const upd = (fn: (d: CvDoc) => CvDoc) => {
    setSave("dirty");
    setDoc((d) => fn(structuredClone(d)));
  };
  const setExp = (id: string, patch: Partial<CvExp>) => upd((d) => ({ ...d, experience: d.experience.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  async function act(action: "ready" | "reopen" | "approve" | "new-version", acknowledged = false): Promise<void> {
    setBusy(action);
    setErr(null);
    const res = await fetch(`/api/admin/cv-docs/${docId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, acknowledged }) });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.status === 409 && j.warns) {
      if (window.confirm(`${j.error} Approve anyway? Check the list on the right first.`)) return act(action, true);
      return;
    }
    if (!res.ok) return setErr(j.error ?? "Couldn't do that.");
    if (action === "new-version") return router.push(`/analytics/edge/cv/${briefId}/doc/${j.id}`);
    setStatus(action === "ready" ? "in_review" : action === "reopen" ? "draft" : "approved");
    router.refresh();
  }

  const secs = sections(doc);
  const secTitle = (id: string) => secs.find((s) => s.id === id)?.title ?? id;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-5 py-6">
      <Link href={`/analytics/edge/cv/${briefId}`} className="text-xs text-teal-700 hover:underline dark:text-teal-400">← {props.name}: Sales CV form</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ros-page-title">{props.name}: CV, version {props.version}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
            {props.approvedBy && ["approved", "shared", "final"].includes(status) && <span>approved by {props.approvedBy}</span>}
            {props.sharedAt && ["shared", "changes_requested", "final"].includes(status) && <span>· shared with {props.sharedTo} on {new Date(props.sharedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
            {editable && <span className={save === "error" ? "text-red-600" : ""}>· {{ idle: "Edit anything. It saves as you go.", dirty: "Saving…", saving: "Saving…", saved: "All changes saved", error: "Couldn't save, retry by editing" }[save]}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className={BTN} href={`/api/admin/cv-docs/${docId}/pdf`}>Download PDF</a>
          <a className={BTN} href={`/api/admin/cv-docs/${docId}/docx`}>Download Word</a>
          {status === "draft" && <button className={BTN} disabled={!!busy} onClick={() => act("ready")}>Mark ready for approval</button>}
          {(status === "draft" || status === "in_review") && <button className={PRIMARY} disabled={!!busy} onClick={() => act("approve")}>{busy === "approve" ? "Approving…" : "Approve"}</button>}
          {(status === "in_review" || status === "approved") && <button className={BTN} disabled={!!busy} onClick={() => act("reopen")}>Back to draft</button>}
          {status === "approved" && <button className={PRIMARY} onClick={() => setShareOpen(true)}>Share with candidate</button>}
          {status === "shared" && <button className={BTN} onClick={() => setShareOpen(true)}>Send the link again</button>}
          {["approved", "shared", "changes_requested", "final"].includes(status) && <button className={status === "changes_requested" ? PRIMARY : BTN} disabled={!!busy} onClick={() => act("new-version")}>{status === "changes_requested" ? "Start a new version from their feedback" : "New version"}</button>}
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">{err}</p>}
      {!editable && <p className="rounded-lg bg-slate-100 px-3 py-2 text-[13px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">This version is locked, so what the candidate sees never changes underneath them. To change it, start a new version.</p>}
      {props.polishNote && <p className="text-xs text-slate-500">{props.polishNote}</p>}
      {props.versions.length > 1 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Versions:
          {props.versions.map((v) => (
            <Link key={v.id} href={`/analytics/edge/cv/${briefId}/doc/${v.id}`} className={`rounded-full px-2 py-0.5 font-medium ${v.id === docId ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>v{v.version}: {STATUS_LABEL[v.status]}</Link>
          ))}
        </p>
      )}

      {props.response && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{props.response.decision === "approved" ? "The candidate approved this CV" : "The candidate asked for changes"}</h2>
          {props.response.general && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-slate-700 dark:text-slate-200">{props.response.general}</p>}
          {Object.entries(props.response.comments).length > 0 && (
            <ul className="mt-2 space-y-1.5 text-[13px]">
              {Object.entries(props.response.comments).map(([k, v]) => <li key={k}><span className="font-semibold">{secTitle(k)}:</span> <span className="whitespace-pre-wrap">{v}</span></li>)}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="space-y-4">
          <Card title="Header">
            <div className="grid gap-3 md:grid-cols-2">
              <label><span className={LBL}>Name</span><input disabled={!editable} className={INP} value={doc.header.name} onChange={(e) => upd((d) => ({ ...d, header: { ...d.header, name: e.target.value } }))} /></label>
              <label><span className={LBL}>Headline under the name</span><input disabled={!editable} className={INP} value={doc.header.headline} onChange={(e) => upd((d) => ({ ...d, header: { ...d.header, headline: e.target.value } }))} /></label>
              <label><span className={LBL}>Email</span><input disabled={!editable} className={INP} value={doc.header.email} onChange={(e) => upd((d) => ({ ...d, header: { ...d.header, email: e.target.value } }))} /></label>
              <label><span className={LBL}>Phone</span><input disabled={!editable} className={INP} value={doc.header.phone} onChange={(e) => upd((d) => ({ ...d, header: { ...d.header, phone: e.target.value } }))} /></label>
              <label><span className={LBL}>City</span><input disabled={!editable} className={INP} value={doc.header.city} onChange={(e) => upd((d) => ({ ...d, header: { ...d.header, city: e.target.value } }))} /></label>
              <label><span className={LBL}>LinkedIn</span><input disabled={!editable} className={INP} value={doc.header.linkedin} onChange={(e) => upd((d) => ({ ...d, header: { ...d.header, linkedin: e.target.value } }))} /></label>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" disabled={!editable || !props.hasPhoto} checked={doc.header.showPhoto} onChange={(e) => upd((d) => ({ ...d, header: { ...d.header, showPhoto: e.target.checked } }))} />
              Show their photo {props.hasPhoto ? "" : "(none uploaded)"}
              <span className="text-xs text-slate-400">They said: {props.photoPref || "not answered"}</span>
            </label>
          </Card>

          <Card title="Summary" sub="The paragraph at the top. Keep it to what the candidate told us.">
            <textarea disabled={!editable} rows={4} className={INP} value={doc.summary} onChange={(e) => upd((d) => ({ ...d, summary: e.target.value }))} />
          </Card>

          <Card title="Career at a glance" sub="Three or four headline figures.">
            <Lines disabled={!editable} items={doc.highlights} onChange={(v) => upd((d) => ({ ...d, highlights: v }))} />
          </Card>

          {doc.experience.map((e, i) => (
            <Card key={e.id} title={`${e.company || "Experience"}`} sub={`Job ${i + 1} of ${doc.experience.length}`}>
              <div className="grid gap-3 md:grid-cols-3">
                <label><span className={LBL}>Company</span><input disabled={!editable} className={INP} value={e.company} onChange={(ev) => setExp(e.id, { company: ev.target.value })} /></label>
                <label><span className={LBL}>Location</span><input disabled={!editable} className={INP} value={e.location} onChange={(ev) => setExp(e.id, { location: ev.target.value })} /></label>
                <label><span className={LBL}>Period</span><input disabled={!editable} className={INP} value={e.period} onChange={(ev) => setExp(e.id, { period: ev.target.value })} /></label>
              </div>
              <div>
                <span className={LBL}>Roles (a promotion is two roles at one company)</span>
                <div className="space-y-1.5">
                  {e.roles.map((r, k) => (
                    <div key={k} className="grid grid-cols-[1fr_180px_auto] gap-1.5">
                      <input disabled={!editable} className={INP} value={r.title} placeholder="Job title" onChange={(ev) => setExp(e.id, { roles: e.roles.map((x, y) => (y === k ? { ...x, title: ev.target.value } : x)) })} />
                      <input disabled={!editable} className={INP} value={r.period} placeholder="Apr 2022 – Present" onChange={(ev) => setExp(e.id, { roles: e.roles.map((x, y) => (y === k ? { ...x, period: ev.target.value } : x)) })} />
                      {editable && <button type="button" onClick={() => setExp(e.id, { roles: e.roles.filter((_, y) => y !== k) })} aria-label="Remove role" className="px-2 text-slate-400 hover:text-red-600">×</button>}
                    </div>
                  ))}
                  {editable && <button type="button" onClick={() => setExp(e.id, { roles: [...e.roles, { title: "", period: "" }] })} className="text-[13px] font-medium text-teal-700 hover:underline dark:text-teal-400">+ Add a role</button>}
                </div>
              </div>
              <label className="block"><span className={LBL}>What the job was (one line)</span><textarea disabled={!editable} rows={2} className={INP} value={e.scope} onChange={(ev) => setExp(e.id, { scope: ev.target.value })} /></label>
              <div><span className={LBL}>Achievements</span><Lines disabled={!editable} items={e.bullets} onChange={(v) => setExp(e.id, { bullets: v })} /></div>
              <label className="block"><span className={LBL}>Tools</span><input disabled={!editable} className={INP} value={e.tools} onChange={(ev) => setExp(e.id, { tools: ev.target.value })} /></label>
              {(props.sources[e.id] ?? []).length > 0 && (
                <details className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] dark:bg-slate-800/60">
                  <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">What the candidate told us for this job</summary>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600 dark:text-slate-300">{props.sources[e.id].map((s, k) => <li key={k}>{s}</li>)}</ul>
                </details>
              )}
              {editable && (
                <div className="flex gap-3 text-xs">
                  <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => upd((d) => { const x = [...d.experience]; if (i > 0) [x[i - 1], x[i]] = [x[i], x[i - 1]]; return { ...d, experience: x }; })}>Move up</button>
                  <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => upd((d) => { const x = [...d.experience]; if (i < x.length - 1) [x[i + 1], x[i]] = [x[i], x[i + 1]]; return { ...d, experience: x }; })}>Move down</button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => { if (window.confirm(`Remove ${e.company || "this job"} from the CV?`)) upd((d) => ({ ...d, experience: d.experience.filter((x) => x.id !== e.id) })); }}>Remove from the CV</button>
                </div>
              )}
            </Card>
          ))}
          {editable && <button type="button" className={BTN} onClick={() => upd((d) => ({ ...d, experience: [...d.experience, { id: rid(), company: "", location: "", period: "", roles: [{ title: "", period: "" }], scope: "", bullets: [], tools: "" }] }))}>+ Add an experience</button>}

          <Card title="Education">
            <div className="space-y-1.5">
              {doc.education.map((e, i) => (
                <div key={i} className="grid grid-cols-[1.2fr_1.2fr_80px_auto] gap-1.5">
                  <input disabled={!editable} className={INP} value={e.degree} placeholder="Degree" onChange={(ev) => upd((d) => ({ ...d, education: d.education.map((x, k) => (k === i ? { ...x, degree: ev.target.value } : x)) }))} />
                  <input disabled={!editable} className={INP} value={e.institution} placeholder="Institution" onChange={(ev) => upd((d) => ({ ...d, education: d.education.map((x, k) => (k === i ? { ...x, institution: ev.target.value } : x)) }))} />
                  <input disabled={!editable} className={INP} value={e.year} placeholder="Year" onChange={(ev) => upd((d) => ({ ...d, education: d.education.map((x, k) => (k === i ? { ...x, year: ev.target.value } : x)) }))} />
                  {editable && <button type="button" onClick={() => upd((d) => ({ ...d, education: d.education.filter((_, k) => k !== i) }))} aria-label="Remove" className="px-2 text-slate-400 hover:text-red-600">×</button>}
                </div>
              ))}
              {editable && <button type="button" onClick={() => upd((d) => ({ ...d, education: [...d.education, { degree: "", institution: "", year: "" }] }))} className="text-[13px] font-medium text-teal-700 hover:underline dark:text-teal-400">+ Add</button>}
            </div>
          </Card>

          <Card title="Skills" sub="Each group is one line on the CV. Separate items with commas.">
            <div className="space-y-2">
              {doc.skills.map((g, i) => (
                <div key={i} className="grid grid-cols-[180px_1fr_auto] gap-1.5">
                  <input disabled={!editable} className={INP} value={g.label} onChange={(ev) => upd((d) => ({ ...d, skills: d.skills.map((x, k) => (k === i ? { ...x, label: ev.target.value } : x)) }))} />
                  <input disabled={!editable} className={INP} value={g.items.join(", ")} onChange={(ev) => upd((d) => ({ ...d, skills: d.skills.map((x, k) => (k === i ? { ...x, items: ev.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)) }))} />
                  {editable && <button type="button" onClick={() => upd((d) => ({ ...d, skills: d.skills.filter((_, k) => k !== i) }))} aria-label="Remove" className="px-2 text-slate-400 hover:text-red-600">×</button>}
                </div>
              ))}
              {editable && <button type="button" onClick={() => upd((d) => ({ ...d, skills: [...d.skills, { label: "Skills", items: ["x"] }] }))} className="text-[13px] font-medium text-teal-700 hover:underline dark:text-teal-400">+ Add a group</button>}
            </div>
          </Card>

          <Card title="Certifications"><Lines disabled={!editable} items={doc.certifications} onChange={(v) => upd((d) => ({ ...d, certifications: v }))} /></Card>
          <Card title="Awards and recognition"><Lines disabled={!editable} items={doc.awards} onChange={(v) => upd((d) => ({ ...d, awards: v }))} /></Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Checks against the candidate&apos;s answers</h2>
            {flags.length === 0 ? (
              <p className="mt-2 text-[13px] text-emerald-700 dark:text-emerald-300">✓ Every figure matches what the candidate told us, and nothing private is on the CV.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-[12.5px]">
                {[...warns, ...flags.filter((f) => f.level === "info")].map((f, i) => (
                  <li key={i} className={`rounded-lg px-2.5 py-1.5 ${f.level === "warn" ? "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200" : "bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"}`}>
                    <span className="font-semibold">{f.where}: </span>{f.message}
                    {f.text && <span className="mt-0.5 block truncate text-[11.5px] opacity-70">“{f.text}”</span>}
                  </li>
                ))}
              </ul>
            )}
            {warns.length > 0 && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{warns.length} {warns.length === 1 ? "problem" : "problems"} to look at before approving.</p>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Preview</h2>
              <button className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400" onClick={() => setPreviewKey((k) => k + 1)}>Refresh</button>
            </div>
            <iframe title="CV preview" src={`/api/admin/cv-docs/${docId}/pdf?inline=1&v=${previewKey}`} className="h-[78vh] w-full rounded-lg border border-slate-200 dark:border-slate-700" />
          </section>
        </aside>
      </div>

      {shareOpen && <ShareModal docId={docId} name={props.name} to={props.to} message={props.shareMessage} resend={status === "shared"} onClose={() => setShareOpen(false)} onSent={(link) => { setReviewUrl(link); setStatus("shared"); setShareOpen(false); router.refresh(); }} />}
      {reviewUrl && status === "shared" && <p className="text-xs text-slate-400">Their private link: {reviewUrl}</p>}
    </div>
  );
}

function ShareModal({ docId, name, to: to0, message: msg0, resend, onClose, onSent }: { docId: string; name: string; to: string; message: string; resend: boolean; onClose: () => void; onSent: (link: string) => void }) {
  const [to, setTo] = useState(to0);
  const [msg, setMsg] = useState(msg0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/cv-docs/${docId}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, message: msg }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Couldn't send.");
    onSent(j.link ?? "");
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold">{resend ? "Send the link again to" : "Share the CV with"} {name || "the candidate"}</h3>
        <p className="mt-1 text-xs text-slate-500">They get a private link to read the CV and approve it or ask for changes. Sent from info@staffanchor.com with a copy to you. It goes only when you press Send.</p>
        <label className="mt-3 block"><span className={LBL}>To</span><input className={INP} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@email.com" /></label>
        <label className="mt-3 block"><span className={LBL}>Message (the link is added below it, with your signature)</span><textarea className={INP} rows={6} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className={BTN}>Cancel</button>
          <button onClick={send} disabled={busy || !to.trim() || msg.trim().length < 10} className={PRIMARY}>{busy ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}
