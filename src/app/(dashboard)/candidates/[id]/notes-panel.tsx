"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Note = {
  id: string;
  note_type: string;
  content: string;
  created_at: string;
};

const NOTE_TYPES = ["call_note", "reference_check", "client_feedback", "post_placement"];

export default function NotesPanel({
  candidateId,
  notes,
}: {
  candidateId: string;
  notes: Note[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("call_note");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!content.trim()) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("recruiter_notes").insert({
      candidate_id: candidateId,
      author_id: user?.id,
      note_type: noteType,
      content: content.trim(),
    });
    setContent("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Notes</h2>
      <div className="flex gap-2 mb-4">
        <select
          value={noteType}
          onChange={(e) => setNoteType(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        >
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note after this interaction..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={saving}
          className="rounded-lg bg-slate-900 text-white text-sm px-4 py-1.5 disabled:opacity-60"
        >
          Add
        </button>
      </div>
      <div className="space-y-3">
        {notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="border-l-2 border-slate-200 pl-3">
            <p className="text-xs text-slate-400">
              {n.note_type.replace(/_/g, " ")} · {new Date(n.created_at).toLocaleString()}
            </p>
            <p className="text-sm text-slate-700">{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
