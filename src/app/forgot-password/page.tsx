"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">StaffAnchor</p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Reset your password</h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter your account email and we&apos;ll send you a reset link.
          </p>
        </div>

        {status === "sent" ? (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
            <p className="text-sm font-medium text-teal-900">Check your email</p>
            <p className="text-xs text-teal-700 mt-1">
              If an account exists for {email}, a password reset link is on its way. It&apos;s valid for a
              limited time.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 transition disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-sm text-slate-500 mt-5 text-center">
          <Link href="/login" className="text-blue-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
