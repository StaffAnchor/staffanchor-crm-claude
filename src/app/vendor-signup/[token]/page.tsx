"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// Public self-serve signup for an invited vendor agency's first recruiter --
// replaces the old flow where an admin manually typed a password into
// team/create-user-form.tsx and handed it off out-of-band. Deliberately
// outside (dashboard) and vendor/ layouts (no session exists yet); the
// invite token itself is the only credential, validated server-side by
// api/vendor-signup/[token].
export default function VendorSignupPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [invalidReason, setInvalidReason] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/vendor-signup/${params.token}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setStatus("invalid");
          setInvalidReason(json.error);
          return;
        }
        setAgencyName(json.agencyName);
        setForm((f) => ({ ...f, email: json.contactEmail ?? "" }));
        setStatus("valid");
      })
      .catch(() => {
        setStatus("invalid");
        setInvalidReason("Something went wrong loading this invite. Please try again.");
      });
  }, [params.token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/vendor-signup/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">StaffAnchor vendor portal</h1>

        {status === "loading" && <p className="text-sm text-slate-500 mt-3">Loading your invite...</p>}

        {status === "invalid" && (
          <p className="text-sm text-red-600 mt-3">{invalidReason}</p>
        )}

        {status === "valid" && !done && (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Set up your account to submit candidates for <strong>{agencyName}</strong>.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                required
                placeholder="Your full name"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                type="password"
                placeholder="Choose a password (min. 8 characters)"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
              >
                {submitting ? "Creating account..." : "Create account"}
              </button>
            </form>
          </>
        )}

        {done && (
          <p className="text-sm text-emerald-700 mt-3">
            Account created. Redirecting you to sign in...
          </p>
        )}
      </div>
    </div>
  );
}
