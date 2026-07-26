"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Phone, MessageCircle, Mail, StickyNote, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type Activity = {
  id: string;
  actor_id: string | null;
  kind: "call" | "whatsapp" | "email" | "note" | "stage_change";
  body: string | null;
  created_at: string;
  actor_name?: string | null;
};

const KIND_OPTIONS: Activity["kind"][] = ["call", "whatsapp", "email", "note"];

const KIND_LABEL: Record<Activity["kind"], string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  note: "Note",
  stage_change: "Stage change",
};

const KIND_ICON: Record<Activity["kind"], typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  note: StickyNote,
  stage_change: RefreshCw,
};

const KIND_COLOR: Record<Activity["kind"], string> = {
  call: "bg-blue-50 text-blue-600",
  whatsapp: "bg-emerald-50 text-emerald-600",
  email: "bg-violet-50 text-violet-600",
  note: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  stage_change: "bg-amber-50 text-amber-600",
};

// This is a lightweight, multi-channel activity log -- distinct from the
// structured Notes tab (recruiter_notes: call_note / reference_check /
// client_feedback / post_placement). The point here is friction-free
// logging of a quick contact touch ("Called, no answer", "WhatsApped the
// JD") so a recruiter's actual outreach cadence with a candidate is visible
// to anyone else who picks up the file -- the #1 gap called out for a team
// scaling past a single recruiter.
export default function ActivityLogPanel({
  candidateId,
  activities,
}: {
  candidateId: string;
  activities: Activity[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [kind, setKind] = useState<Activity["kind"]>("call");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("activities").insert({
      actor_id: user?.id ?? null,
      entity_type: "candidate",
      entity_id: candidateId,
      kind,
      body: body.trim() || null,
    });
    if (error) {
      window.alert(`Couldn't log activity: ${error.message}`);
      setSaving(false);
      return;
    }
    setBody("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Activity["kind"])}
          className="rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-[12px] bg-slate-50 dark:bg-slate-800/50 transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="What happened? e.g. Called, no answer -- will retry tomorrow"
          className="flex-1 rounded-ros-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[13px] transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <Button onClick={handleAdd} disabled={saving}>
          Log
        </Button>
      </div>
      <div className="space-y-0">
        {activities.length === 0 && (
          <EmptyState
            icon={<Phone className="w-5 h-5 text-slate-400" />}
            title="No activity logged yet"
            description="Log a call, WhatsApp, or email touch as soon as it happens."
            className="py-10"
          />
        )}
        {activities.map((a, i) => {
          const Icon = KIND_ICON[a.kind];
          return (
            <div key={a.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-ros-full flex items-center justify-center shrink-0 transition-colors duration-200 ease-ros ${KIND_COLOR[a.kind]}`}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                </div>
                {i < activities.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-1" />}
              </div>
              <div className="pb-5">
                <p className="text-[13px] text-slate-800 dark:text-slate-200">
                  {KIND_LABEL[a.kind]}
                  {a.actor_name ? ` by ${a.actor_name}` : ""}
                </p>
                {a.body && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{a.body}</p>}
                <p className="text-[11px] text-slate-400 mt-1">{new Date(a.created_at).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
