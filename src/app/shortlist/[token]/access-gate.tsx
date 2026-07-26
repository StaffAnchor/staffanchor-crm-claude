"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Two-step email-OTP gate shown instead of any candidate data until the
// visitor proves control of an email address registered as a client_contacts
// row for this mandate's client. On success, verify-code sets a signed
// httpOnly cookie and we router.refresh() so the server component re-checks
// it and renders the real shortlist -- no client-side data ever needs to
// flow through this component.
export default function AccessGate({ token }: { token: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestCode() {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/shortlist/${token}/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send a code.");
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send a code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/shortlist/${token}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That code didn't work.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-[13px] font-bold text-white shrink-0">
            S
          </div>
          <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">StaffAnchor Talent Solutions</p>
        </div>

        {step === "email" ? (
          <>
            <h1 className="text-base font-semibold text-slate-900 mb-1">View this shortlist</h1>
            <p className="text-sm text-slate-500 mb-4">
              Enter the email address your StaffAnchor recruiter registered you under, and we&apos;ll send a
              one-time code to view it.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && requestCode()}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
              autoFocus
            />
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <button
              onClick={requestCode}
              disabled={loading || !email.trim()}
              className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send code"}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-base font-semibold text-slate-900 mb-1">Enter your code</h1>
            <p className="text-sm text-slate-500 mb-4">
              We sent a 6-digit code to <span className="font-medium text-slate-700">{email}</span>. It expires in 10
              minutes.
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verifyCode()}
              placeholder="123456"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 tracking-[0.3em] text-center font-mono"
              autoFocus
            />
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <button
              onClick={verifyCode}
              disabled={loading || code.length !== 6}
              className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
            <button
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              className="w-full text-xs text-slate-400 hover:text-slate-600 mt-2"
            >
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
