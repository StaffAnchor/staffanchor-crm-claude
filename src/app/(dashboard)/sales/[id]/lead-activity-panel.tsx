"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Users, StickyNote, GitBranch, Link2 } from "lucide-react";
import type { SalesActivityRow, SalesLeadRow } from "../sales-constants";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  meeting: Users,
  stage_change: GitBranch,
  linkedin_message: Link2,
};

const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  stage_change: "Stage change",
  linkedin_message: "LinkedIn message",
};

export default function LeadActivityPanel({
  lead,
  activities,
  actorNames,
}: {
  lead: SalesLeadRow;
  activities: SalesActivityRow[];
  actorNames: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [type, setType] = useState("note");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!detail.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("sales_lead_activities").insert({
      lead_id: lead.id,
      activity_type: type,
      detail: detail.trim(),
    });
    setSaving(false);
    if (error) {
      window.alert(`Couldn't save: ${error.message}`);
      return;
    }
    setDetail("");
    router.refresh();
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Activity &amp; notes</h2>

      <div className="flex gap-2 mb-4">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-[12.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="note">Note</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="linkedin_message">LinkedIn message</option>
        </select>
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="What happened / what's next..."
          className="flex-1 text-[13px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <Button size="sm" onClick={handleAdd} disabled={saving || !detail.trim()}>
          Add
        </Button>
      </div>

      {activities.length === 0 ? (
        <p className="text-[13px] text-slate-400">No activity logged yet.</p>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {activities.map((a) => {
            const Icon = TYPE_ICON[a.activity_type] ?? StickyNote;
            return (
              <div key={a.id} className="flex gap-2.5">
                <div className="w-6 h-6 rounded-ros-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3 h-3 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">{TYPE_LABEL[a.activity_type] ?? a.activity_type}</span>
                    {a.detail ? ` — ${a.detail}` : ""}
                  </p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5">
                    {a.actor_id ? `${actorNames[a.actor_id] ?? "Unknown"} · ` : ""}
                    {new Date(a.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
