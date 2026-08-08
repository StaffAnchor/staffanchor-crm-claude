"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function OutreachPersonaForm({
  initialSenderName,
  initialSenderBio,
}: {
  initialSenderName: string;
  initialSenderBio: string;
}) {
  const supabase = createClient();
  const [senderName, setSenderName] = useState(initialSenderName);
  const [senderBio, setSenderBio] = useState(initialSenderBio);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const inputClass =
    "w-full text-[13px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros";
  const labelClass = "text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block";

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        outreach_sender_name: senderName.trim() || null,
        outreach_sender_bio: senderBio.trim() || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      window.alert(`Couldn't save: ${error.message}`);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Sign messages as</label>
        <input
          className={inputClass}
          value={senderName}
          onChange={(e) => {
            setSenderName(e.target.value);
            setSaved(false);
          }}
          placeholder="Your first name (defaults to the founder)"
        />
      </div>
      <div>
        <label className={labelClass}>Your background / credibility line</label>
        <textarea
          className={inputClass}
          rows={3}
          value={senderBio}
          onChange={(e) => {
            setSenderBio(e.target.value);
            setSaved(false);
          }}
          placeholder='e.g. "I run partnerships at StaffAnchor and spent 6 years in SaaS sales before this."'
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {saved && <span className="text-[11.5px] text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}
