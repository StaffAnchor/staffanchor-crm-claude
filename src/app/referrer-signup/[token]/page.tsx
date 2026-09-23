"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// Public self-serve signup for an approved Sales Circle referrer -- mirrors
// vendor-signup/[token]/page.tsx. Unlike the vendor version, name and email
// are fixed from the application (not re-entered), since this is one person
// finishing their own account, not an agency's first recruiter typing in
// details on someone else's behalf.
export default function ReferrerSignupPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [invalidReason, setInvalidReason] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/referrer-signup/${params.token}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setStatus("invalid");
          setInvalidReason(json.error);
          return;
        }
        setFullName(json.fullName ?? "");
        setEmail(json.email ?? "");
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
    const res = await fetch(`/api/referrer-signup/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
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
        <h1 className="text-lg font-semibold text-slate-900 mb-1">StaffAnchor Sales Circle</h1>

        {status === "loading" && <p className="text-sm text-slate-500 mt-3">Loading your invite...</p>}
        {status === "invalid" && <p className="text-sm text-red-600 mt-3">{invalidReason}</p>}

        {status === "valid" && !done && (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Welcome, {fullName}. Set a password for <strong>{email}</strong> to finish setting up your account.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                required
                type="password"
                placeholder="Choose a password (min. 8 characters)"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2 disabled:opacity-60"
              >
                {submitting ? "Creating account..." : "Create account"}
              </button>
            </form>
          </>
        )}

        {done && <p className="text-sm text-emerald-700 mt-3">Account created. Redirecting you to sign in...</p>}
      </div>
    </div>
  );
}
