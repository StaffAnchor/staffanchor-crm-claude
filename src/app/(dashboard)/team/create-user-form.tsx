"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function CreateUserForm() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "recruiter",
    password: generatePassword(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { error } = await supabase.rpc("admin_create_recruiter", {
      p_full_name: form.full_name,
      p_email: form.email,
      p_password: form.password,
      p_role: form.role,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCreated({ email: form.email, password: form.password });
    setForm({ full_name: "", email: "", role: "recruiter", password: generatePassword() });
    router.refresh();
  }

  if (created) {
    return (
      <div className="space-y-3">
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
          <p className="text-sm font-medium text-teal-900">Account created</p>
          <p className="text-xs text-teal-700 mt-1">
            Share these credentials with them directly (not visible again after you leave this page):
          </p>
          <p className="text-sm mt-2 font-mono text-slate-800">{created.email}</p>
          <p className="text-sm font-mono text-slate-800">{created.password}</p>
        </div>
        <button
          onClick={() => setCreated(null)}
          className="text-sm text-blue-600 hover:underline"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        required
        placeholder="Full name"
        value={form.full_name}
        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <input
        required
        type="email"
        placeholder="Email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <select
        value={form.role}
        onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      >
        <option value="recruiter">Recruiter</option>
        <option value="admin">Admin</option>
        <option value="freelancer">Freelancer (limited access)</option>
      </select>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Temporary password (share this with them)
        </label>
        <div className="flex gap-2">
          <input
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
            className="text-xs px-2 rounded-lg border border-slate-300 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
          >
            Regenerate
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
      >
        {saving ? "Creating..." : "Create account"}
      </button>
    </form>
  );
}
