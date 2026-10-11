"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Trash2 } from "lucide-react";
import type { OrphanFile } from "@/lib/orphan-files";
import { KIND_LABEL } from "@/lib/orphan-files";

const KINDS: OrphanFile["kind"][] = ["duplicate_file", "name_match", "unknown"];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function FilesView({ files, isAdmin, totalProfiles }: { files: OrphanFile[]; isAdmin: boolean; totalProfiles: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<OrphanFile["kind"]>("duplicate_file");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const byKind = useMemo(() => {
    const m: Record<OrphanFile["kind"], OrphanFile[]> = { duplicate_file: [], name_match: [], unknown: [] };
    for (const f of files) m[f.kind].push(f);
    return m;
  }, [files]);
  const rows = byKind[tab];
  const totalMb = files.reduce((s, f) => s + f.size_bytes, 0);

  function toggle(path: string) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }
  function selectAll() {
    setPicked(new Set(rows.map((r) => r.path)));
  }

  async function deleteSelected() {
    const paths = rows.filter((r) => picked.has(r.path)).map((r) => r.path);
    if (paths.length === 0) return;
    if (!window.confirm(`Permanently delete ${paths.length} CV file${paths.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBusy("delete");
    setMessage(null);
    try {
      const res = await fetch("/api/candidates/files/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) });
      const d = await res.json().catch(() => ({}));
      setMessage(res.ok ? `Deleted ${d.deleted}${d.skipped ? `, ${d.skipped} skipped because they are now in use or too new` : ""}.` : d.error ?? "Couldn't delete.");
      setPicked(new Set());
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function attach(f: OrphanFile) {
    if (!f.match_candidate_id) return;
    setBusy(f.path);
    setMessage(null);
    try {
      const res = await fetch("/api/candidates/files/attach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: f.path, candidateId: f.match_candidate_id }) });
      const d = await res.json().catch(() => ({}));
      setMessage(res.ok ? `Attached to ${f.match_name}.` : d.error ?? "Couldn't attach.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold text-slate-900 dark:text-slate-100">
          <FileText className="h-5 w-5 text-slate-400" /> CV files not attached to a profile
        </h1>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Files uploaded in bulk upload that never became a profile (duplicates, failed rows, re-uploads). {files.length} files, {mb(totalMb)}, across {totalProfiles.toLocaleString("en-IN")} profiles.
          Files from the last 24 hours are left out, so uploads in progress are safe. Nothing is deleted until you confirm.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              setPicked(new Set());
            }}
            className={`rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 transition-colors ${tab === k ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"}`}
          >
            {KIND_LABEL[k]} <span className="tabular-nums opacity-70">{byKind[k].length}</span>
          </button>
        ))}
      </div>

      <p className="mb-3 text-[12.5px] text-slate-500 dark:text-slate-400">
        {tab === "duplicate_file" && "These are the same file as one already attached to a profile. Safe to delete."}
        {tab === "name_match" && "The file name matches a profile. If that profile has no CV yet, attach it; otherwise it is most likely a duplicate."}
        {tab === "unknown" && "No match found. Open each one: if it is a real candidate, re-upload it in Bulk upload; otherwise delete it."}
      </p>

      {isAdmin && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button onClick={selectAll} className="text-[12.5px] font-medium text-blue-600 hover:underline">
            Select all {rows.length}
          </button>
          {picked.size > 0 && (
            <button onClick={() => setPicked(new Set())} className="text-[12.5px] text-slate-500 hover:underline">
              Clear
            </button>
          )}
          <button
            onClick={deleteSelected}
            disabled={picked.size === 0 || busy !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete selected ({picked.size})
          </button>
        </div>
      )}
      {!isAdmin && <p className="mb-3 text-[12.5px] text-amber-700">Only an admin can delete files. You can preview them and attach a file to a profile.</p>}
      {message && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-[13px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        {rows.length === 0 && <p className="p-4 text-[13px] text-slate-400">Nothing here.</p>}
        {rows.map((f) => (
          <div key={f.path} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-[13px] last:border-b-0 dark:border-slate-800">
            {isAdmin && <input type="checkbox" checked={picked.has(f.path)} onChange={() => toggle(f.path)} aria-label={`Select ${f.file}`} />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800 dark:text-slate-200">{f.file}</p>
              <p className="text-[11.5px] text-slate-400">
                Uploaded {when(f.uploaded_at)} · {mb(f.size_bytes)}
                {f.match_candidate_id && (
                  <>
                    {" "}
                    · {f.kind === "duplicate_file" ? "already on" : "looks like"}{" "}
                    <Link href={`/candidates/${f.match_candidate_id}`} className="text-blue-600 hover:underline">
                      {f.match_name}
                    </Link>
                    {f.kind === "name_match" && (f.match_has_cv ? " (already has a CV)" : " (has no CV yet)")}
                  </>
                )}
              </p>
            </div>
            <a href={`/api/candidates/files/preview?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer" className="text-[12.5px] font-medium text-blue-600 hover:underline">
              Preview
            </a>
            {f.kind === "name_match" && f.match_candidate_id && !f.match_has_cv && (
              <button
                onClick={() => attach(f)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {busy === f.path && <Loader2 className="h-3 w-3 animate-spin" />} Attach to {f.match_name}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
