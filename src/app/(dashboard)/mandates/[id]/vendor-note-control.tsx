"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageSquarePlus } from "lucide-react";

// Lets a recruiter/admin leave a short note for the vendor who submitted
// this candidate -- a feedback channel distinct from the stage itself and
// from the client rejection_reason (e.g. "good profile, but client wants
// 2+ yrs specifically in SaaS" -- coaching for next time, not just an
// outcome). Only rendered for vendor-submitted rows; surfaces back to the
// vendor on My Submissions / My Candidates via get_my_vendor_submissions()
// and get_my_vendor_candidates().
export default function VendorNoteControl({
  linkId,
  currentNote,
}: {
  linkId: string;
  currentNote: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(currentNote ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.rpc("vendor_set_link_note", { p_link_id: linkId, p_note: note });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10.5px] text-amber-700 hover:text-amber-800"
      >
        <MessageSquarePlus className="w-3 h-3" />
        {currentNote ? "Edit note for vendor" : "Note for vendor"}
      </button>
    );
  }

  return (
    <div className="mt-1 w-56">
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional feedback for the vendor..."
        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11.5px]"
      />
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={save}
          disabled={saving}
          className="text-[10.5px] font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="text-[10.5px] text-slate-400 hover:text-slate-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
