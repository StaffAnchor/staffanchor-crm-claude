"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const OPTIONS: { value: string; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "interview_requested", label: "Schedule interview" },
  { value: "not_interested", label: "Not interested" },
];

export default function FeedbackButtons({
  token,
  linkId,
  current,
}: {
  token: string;
  linkId: string;
  current: string | null;
}) {
  const [feedback, setFeedback] = useState(current);
  const [saving, setSaving] = useState(false);

  async function submit(value: string) {
    setSaving(true);
    const { error } = await supabase.rpc("submit_client_shortlist_feedback", {
      p_token: token,
      p_link_id: linkId,
      p_feedback: value,
    });
    setSaving(false);
    if (!error) setFeedback(value);
  }

  return (
    <div className="flex gap-2 mt-4">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => submit(o.value)}
          disabled={saving}
          className={`text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-60 ${
            feedback === o.value
              ? "bg-blue-600 text-white"
              : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
