"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lab/auth/request-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Something went wrong.");
    setStep("code");
  }
  async function verify() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lab/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(j.error ?? "That code isn't right.");
    }
    router.push("/lab/home");
    router.refresh();
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">StaffAnchor</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sales Leaders Lab</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Sign in with the email address your company registered for the programme. We will send you a 6-digit code.</p>
      <div className="mt-6 space-y-3">
        {step === "email" ? (
          <>
            <input className={input} type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" onKeyDown={(e) => e.key === "Enter" && email && send()} />
            <button onClick={send} disabled={busy || !email} className="w-full rounded-xl bg-teal-700 px-4 py-3 text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Sending…" : "Send me a code"}</button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">If <b>{email}</b> is registered, a code is on its way. It expires in 10 minutes.</p>
            <input className={`${input} text-center text-xl tracking-[0.4em]`} inputMode="numeric" placeholder="______" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()} />
            <button onClick={verify} disabled={busy || code.length !== 6} className="w-full rounded-xl bg-teal-700 px-4 py-3 text-[15px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Checking…" : "Sign in"}</button>
            <button onClick={() => { setStep("email"); setCode(""); setError(null); }} className="w-full text-sm text-slate-500 hover:text-slate-800">Use a different email</button>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <p className="mt-8 text-xs text-slate-500">Not registered? Ask your programme contact to add you, or write to info@staffanchor.com.</p>
    </div>
  );
}
