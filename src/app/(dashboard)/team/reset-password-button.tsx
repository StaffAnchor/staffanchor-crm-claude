"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState(generatePassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleReset() {
    setSaving(true);
    setError("");
    const { error } = await supabase.rpc("admin_reset_user_password", {
      p_user_id: userId,
      p_new_password: password,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:underline"
      >
        Reset password
      </button>
    );
  }

  if (done) {
    return (
      <div className="text-xs bg-teal-50 border border-teal-200 rounded-lg p-2 max-w-[220px]">
        <p className="font-medium text-teal-900">New password set for {name}</p>
        <p className="font-mono text-slate-800 mt-1 break-all">{password}</p>
        <p className="text-teal-700 mt-1">Share this with them — it won&apos;t be shown again.</p>
        <button
          onClick={() => {
            setOpen(false);
            setDone(false);
            setPassword(generatePassword());
          }}
          className="mt-1.5 text-blue-600 hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 max-w-[220px] space-y-1.5">
      <p className="font-medium text-slate-700">Reset password for {name}?</p>
      <div className="flex gap-1.5">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="flex-1 min-w-0 rounded border border-slate-300 px-1.5 py-1 font-mono text-[11px]"
        />
        <button
          type="button"
          onClick={() => setPassword(generatePassword())}
          className="px-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 shrink-0"
        >
          ↻
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleReset}
          disabled={saving || password.length < 8}
          className="rounded bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 font-medium disabled:opacity-50"
        >
          {saving ? "Setting..." : "Confirm reset"}
        </button>
        <button onClick={() => setOpen(false)} className="text-slate-500 hover:underline px-1 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
