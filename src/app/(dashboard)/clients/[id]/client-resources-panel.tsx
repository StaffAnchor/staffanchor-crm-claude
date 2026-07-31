"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Link2, FileText, Trash2, Upload, Plus } from "lucide-react";

export type ClientResource = {
  id: string;
  kind: "link" | "file";
  name: string;
  url: string | null;
  storage_path: string | null;
  content_type: string | null;
};

// Client-level resource library -- company website, YouTube channel,
// profile deck (PDF/Word), etc. Shared across every mandate for this client,
// unlike the JD which is mandate-specific. Surfaced as a checklist when
// recruiters send "Email JD to candidates" from any of this client's
// mandates (see mandate-candidates-table.tsx), so a recruiter picks which of
// these to include alongside that mandate's JD rather than always sending
// everything.
export default function ClientResourcesPanel({
  clientId,
  initial,
}: {
  clientId: string;
  initial: ClientResource[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [resources, setResources] = useState(initial);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddLink() {
    if (!linkName.trim() || !linkUrl.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("client_resources")
      .insert({ client_id: clientId, kind: "link", name: linkName.trim(), url: linkUrl.trim() })
      .select("id, kind, name, url, storage_path, content_type")
      .single();
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setResources((prev) => [...prev, data as ClientResource]);
    setLinkName("");
    setLinkUrl("");
    setLinkFormOpen(false);
    router.refresh();
  }

  async function handleUploadFile(file: File) {
    setUploading(true);
    setError(null);
    const safeName = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
    const path = `${clientId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("client-resources")
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }
    const { data, error: insertError } = await supabase
      .from("client_resources")
      .insert({
        client_id: clientId,
        kind: "file",
        name: file.name.replace(/\.[^.]+$/, ""),
        storage_path: path,
        content_type: file.type || null,
      })
      .select("id, kind, name, url, storage_path, content_type")
      .single();
    setUploading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setResources((prev) => [...prev, data as ClientResource]);
    router.refresh();
  }

  async function handleDelete(r: ClientResource) {
    if (!window.confirm(`Remove "${r.name}"?`)) return;
    setResources((prev) => prev.filter((x) => x.id !== r.id));
    if (r.kind === "file" && r.storage_path) {
      await supabase.storage.from("client-resources").remove([r.storage_path]);
    }
    await supabase.from("client_resources").delete().eq("id", r.id);
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Company resources</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Optional -- website, YouTube, profile deck, etc. Shared across all mandates for this client.
        Selectable when emailing the JD to candidates from any of this client&apos;s mandates. Never
        shown on the public job listing.
      </p>

      {resources.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              {r.kind === "link" ? (
                <Link2 className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <FileText className="w-3 h-3 text-slate-400 shrink-0" />
              )}
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{r.name}</span>
              {r.kind === "link" && r.url && (
                <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">
                  {r.url}
                </a>
              )}
              <button onClick={() => handleDelete(r)} className="ml-auto text-slate-300 hover:text-rose-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setLinkFormOpen((v) => !v)}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add link
        </button>
        <label className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer">
          <Upload className="w-3 h-3" /> {uploading ? "Uploading..." : "Upload PDF/Word"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {linkFormOpen && (
        <div className="mt-3 space-y-2 border border-slate-100 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50">
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Label (e.g. Company Website)"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-500"
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-500"
          />
          <button
            onClick={handleAddLink}
            disabled={saving || !linkName.trim() || !linkUrl.trim()}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium py-1.5"
          >
            {saving ? "Adding…" : "Add link"}
          </button>
        </div>
      )}
    </div>
  );
}
