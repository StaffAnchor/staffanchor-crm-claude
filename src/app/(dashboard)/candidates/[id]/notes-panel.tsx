"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
    await supabase.from("audit_log").insert({
      actor: user?.id,
      action: "note_added",
      entity: "candidate",
      entity_id: candidateId,
      detail: { note_type: noteType },
    });
    setContent("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <select
          value={noteType}
          onChange={(e) => setNoteType(e.target.value)}
          className="rounded-ros-md border border-slate-200 px-2 py-1.5 text-[12px] bg-slate-50 transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a note after this interaction..."
          className="flex-1 rounded-ros-md border border-slate-200 px-3 py-1.5 text-[13px] transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <Button onClick={handleAdd} disabled={saving}>
          Add
        </Button>
      </div>
      <div className="space-y-3">
        {notes.length === 0 && (
          <EmptyState
            icon={<MessageSquare className="w-5 h-5 text-slate-400" />}
            title="No notes yet"
            description="Add one after your first call."
            className="py-10"
          />
        )}
        {notes.map((n) => (
          <div key={n.id} className="border-l-2 border-slate-200 pl-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">
              {n.note_type.replace(/_/g, " ")} · {new Date(n.created_at).toLocaleString()}
            </p>
            <p className="text-[13px] text-slate-700 mt-0.5">{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
