"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Link2, Plus, Trash2, Check, Pencil } from "lucide-react";

export type EmailLink = { name: string; url: string };

// Optional, recruiter-curated links (company website, YouTube channel, deck,
// etc.) attached to the mandate so they can be included in the "Email JD to
// candidates" send (see /api/mandates/[id]/email-jd) alongside the JD PDF.
// Deliberately never selected by the public jobs.staffanchor.com listing --
// only the JD itself is public; these are candidate-email-only extras.
export default function CandidateEmailLinksPanel({
  mandateId,
  initial,
}: {
  mandateId: string;
  initial: EmailLink[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [links, setLinks] = useState<EmailLink[]>(initial.length > 0 ? initial : [{ name: "", url: "" }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function updateLink(i: number, field: keyof EmailLink, value: string) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  function addRow() {
    setLinks((prev) => [...prev, { name: "", url: "" }]);
  }

  function removeRow(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    const cleaned = links.map((l) => ({ name: l.name.trim(), url: l.url.trim() })).filter((l) => l.name && l.url);
    const { error: err } = await supabase.from("mandates").update({ candidate_email_links: cleaned }).eq("id", mandateId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setLinks(cleaned.length > 0 ? cleaned : [{ name: "", url: "" }]);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  const savedLinks = initial.filter((l) => l.name && l.url);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-slate-400" /> Candidate email links
        </h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" /> {savedLinks.length > 0 ? "Edit" : "Add links"}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Optional -- named links (company website, YouTube, profile deck, etc.) included alongside the JD
        when you email candidates. Never shown on the public job listing.
      </p>

      {!editing ? (
        savedLinks.length > 0 ? (
          <ul className="space-y-1.5">
            {savedLinks.map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">{l.name}:</span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline truncate"
                >
                  {l.url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">No extra links added yet.</p>
        )
      ) : (
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={l.name}
                onChange={(e) => updateLink(i, "name", e.target.value)}
                placeholder="Label (e.g. Company Website)"
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                value={l.url}
                onChange={(e) => updateLink(i, "url", e.target.value)}
                placeholder="https://..."
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={() => removeRow(i)} className="text-slate-300 hover:text-rose-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
          >
            <Plus className="w-3 h-3" /> Add another link
          </button>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-60 flex items-center gap-1"
            >
              {saving ? "Saving..." : saved ? (
                <>
                  <Check className="w-3 h-3" /> Saved
                </>
              ) : (
                "Save"
              )}
            </button>
            <button
              onClick={() => {
                setLinks(initial.length > 0 ? initial : [{ name: "", url: "" }]);
                setEditing(false);
                setError("");
              }}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
