"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteAgencyForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", contactName: "", contactEmail: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ signupUrl: string; emailSent: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/vendor-agencies/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to send invite.");
      return;
    }
    setResult({ signupUrl: json.signupUrl, emailSent: json.emailSent });
    setForm({ name: "", contactName: "", contactEmail: "" });
    router.refresh();
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div className={`rounded-lg p-3 ${result.emailSent ? "bg-teal-50 border border-teal-200" : "bg-amber-50 border border-amber-200"}`}>
          <p className={`text-sm font-medium ${result.emailSent ? "text-teal-900" : "text-amber-900"}`}>
            {result.emailSent ? "Invite sent" : "Agency created — email wasn't sent"}
          </p>
          <p className={`text-xs mt-1 ${result.emailSent ? "text-teal-700" : "text-amber-700"}`}>
            {result.emailSent
              ? "They'll receive a signup link by email."
              : "Copy this link and send it to them directly:"}
          </p>
          {!result.emailSent && (
            <p className="text-xs mt-2 font-mono break-all text-slate-800 dark:text-slate-200">{result.signupUrl}</p>
          )}
        </div>
        <button onClick={() => setResult(null)} className="text-sm text-blue-600 hover:underline">
          Invite another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        required
        placeholder="Agency name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <input
        placeholder="Contact name (optional)"
        value={form.contactName}
        onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <input
        required
        type="email"
        placeholder="Contact email"
        value={form.contactEmail}
        onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
      >
        {saving ? "Sending..." : "Send invite"}
      </button>
    </form>
  );
}
