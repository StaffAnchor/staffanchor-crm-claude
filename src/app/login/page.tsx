"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // "password" is the normal sign-in; "code" emails a 6-digit code instead, for
  // anyone who has no password (for example a candidate who is also a referrer)
  // or has forgotten it.
  const [mode, setMode] = useState<"password" | "code">("password");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState("");

  async function sendCode() {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setLoading(true);
    // shouldCreateUser:false so this can never create an account for a stranger.
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    setLoading(false);
    // Same message whether or not the email has an account, so the form can't be used to find out who does.
    if (otpError && !/signups? not allowed|not found|user.*not/i.test(otpError.message)) {
      setError(otpError.message);
      return;
    }
    setCodeSent(true);
    setInfo("If that email has an account, a 6-digit code is on its way. It can take a minute.");
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (verifyError || !data.session) {
      setLoading(false);
      setError("That code didn't work. Check it and try again, or ask for a new one.");
      return;
    }
    window.location.assign("/candidates");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    if (!data.session) {
      setLoading(false);
      setError("Sign-in succeeded but no session was returned. Please try again.");
      return;
    }
    // Hard navigation so the fresh session cookie is guaranteed to be sent
    // on the next request and picked up by middleware/server components.
    window.location.assign("/candidates");
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-50 px-4">
      {/* Same textured-backdrop treatment used on the candidate/client login
          screens -- a soft dot grid plus two muted colour blooms -- so the
          internal sign-in screen doesn't look like a bare, unstyled form. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,theme(colors.slate.300)_1px,transparent_0)] bg-[length:22px_22px] opacity-40" />
      <div className="pointer-events-none absolute -top-24 -left-16 -z-10 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 -z-10 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="w-full max-w-sm bg-white/90 border border-slate-200/80 rounded-xl shadow-lg shadow-slate-200/60 backdrop-blur-sm p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
            StaffAnchor
          </p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Sign in</h1>
          <p className="text-sm text-slate-500 mt-1">
            For the StaffAnchor team, vendors and Sales Circle members. Candidates and clients sign in at jobs.staffanchor.com.
          </p>
        </div>
        <form onSubmit={mode === "code" ? handleCode : handleSubmit} className="space-y-4">
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
          {mode === "password" ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : codeSent ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">6-digit code</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : null}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {mode === "code" && !codeSent ? (
            <button
              type="button"
              onClick={sendCode}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 transition disabled:opacity-60"
            >
              {loading ? "Sending..." : "Email me a code"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 transition disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          )}
        </form>
        <p className="text-sm text-slate-500 mt-3 text-center">
          {mode === "password" ? (
            <button
              type="button"
              onClick={() => {
                setMode("code");
                setError("");
                setInfo("");
                setCodeSent(false);
                setCode("");
              }}
              className="text-blue-600 hover:underline"
            >
              Email me a code instead
            </button>
          ) : (
            <>
              {codeSent && (
                <button type="button" onClick={sendCode} disabled={loading} className="text-blue-600 hover:underline mr-3">
                  Send a new code
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMode("password");
                  setError("");
                  setInfo("");
                }}
                className="text-blue-600 hover:underline"
              >
                Use my password
              </button>
            </>
          )}
        </p>
        <p className="text-sm text-slate-500 mt-4 text-center">
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}
