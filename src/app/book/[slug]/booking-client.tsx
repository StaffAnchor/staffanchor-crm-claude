"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock, Video } from "lucide-react";

type Service = { slug: string; title: string; tagline: string | null; description: string; duration_min: number; price_inr: number; popular: boolean };
type Slots = { ok: boolean; calendarConnected: boolean; days: Record<string, string[]>; error?: string };

declare global {
  interface Window {
    Razorpay?: new (o: Record<string, unknown>) => { open: () => void };
  }
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
const dayParts = (d: string) => {
  const dt = new Date(`${d}T00:00:00Z`);
  return { wd: dt.toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short" }), dm: dt.toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" }) };
};
const longWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true });

const field = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-slate-900";

export default function BookingClient({ service }: { service: Service }) {
  const sp = useSearchParams();
  const src = sp.get("src") ?? sp.get("from") ?? "";
  const [slots, setSlots] = useState<Slots | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [step, setStep] = useState<"time" | "details" | "done">("time");
  const [form, setForm] = useState({ name: "", email: "", phone: "", targetRole: "", notes: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ start: string; meetLink: string | null } | null>(null);

  const loadSlots = useCallback(async () => {
    const res = await fetch(`/api/pro/slots?service=${service.slug}`, { cache: "no-store" });
    const json = (await res.json()) as Slots;
    setSlots(json);
    const first = Object.keys(json.days ?? {}).sort()[0] ?? null;
    setDate((d) => (d && json.days?.[d] ? d : first));
  }, [service.slug]);
  useEffect(() => {
    // Fetch on arrival; the setState happens after the network call, not during render.
    const t = setTimeout(() => void loadSlots(), 0);
    return () => clearTimeout(t);
  }, [loadSlots]);

  const dates = useMemo(() => Object.keys(slots?.days ?? {}).sort(), [slots]);
  const visible = dates.slice(offset, offset + 5);
  const times = date ? slots?.days[date] ?? [] : [];

  async function pay() {
    setError(null);
    if (!slot) return setError("Please pick a time.");
    setBusy(true);
    const res = await fetch("/api/pro/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, service: service.slug, slotStart: slot, src }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: "Something went wrong." }));
    if (!json.ok || !json.orderId) {
      setBusy(false);
      setError(json.error ?? "Couldn't start the payment.");
      if (res.status === 409) {
        setStep("time");
        setSlot(null);
        void loadSlots();
      }
      return;
    }
    if (!window.Razorpay) {
      setBusy(false);
      return setError("The payment window didn't load. Please refresh and try again.");
    }
    const rz = new window.Razorpay({
      key: json.keyId,
      amount: json.amountPaise,
      currency: "INR",
      order_id: json.orderId,
      name: "StaffAnchor",
      description: json.title,
      prefill: { name: form.name, email: form.email, contact: form.phone },
      theme: { color: "#111111" },
      modal: {
        ondismiss: () => {
          setBusy(false);
          setError("Payment wasn't completed. Your time is held for 15 minutes if you'd like to try again.");
        },
      },
      handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        const v = await fetch("/api/pro/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: json.bookingId, orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
        });
        const vj = await v.json().catch(() => ({ ok: false }));
        setBusy(false);
        if (vj.ok) {
          setDone({ start: vj.start, meetLink: vj.meetLink ?? null });
          setStep("done");
        } else {
          setError("Your payment went through but we couldn't confirm the booking on screen. You'll get an email shortly; if not, write to info@staffanchor.com with your payment receipt.");
        }
      },
    });
    rz.open();
  }

  const detailsOk = form.name.trim().length > 1 && /\S+@\S+\.\S+/.test(form.email) && form.phone.replace(/\D/g, "").length >= 10 && form.consent;
  const paras = service.description.split(/\n{2,}/);

  return (
    <div className="min-h-screen bg-[#F4F2EE] px-4 py-8 md:py-12">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1.05fr_1fr]">
        {/* The session */}
        <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="bg-[#F3E9E4] p-6 md:p-8">
            <a href="https://www.staffanchor.com/pro-sessions" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> All Pro Sessions
            </a>
            {service.popular && <span className="mb-3 block w-fit rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">Popular</span>}
            <h1 className="text-[26px] font-bold leading-tight text-slate-900 md:text-[30px]">{service.title}</h1>
            <p className="mt-2 text-sm text-slate-600">with Gagan Sharma, Founder, StaffAnchor</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-y border-slate-100 text-sm">
            <div className="px-5 py-4 font-semibold">₹{service.price_inr.toLocaleString("en-IN")}</div>
            <div className="flex items-center gap-2 px-5 py-4"><CalendarDays className="h-4 w-4" /> {service.duration_min} mins</div>
            <div className="flex items-center gap-2 px-5 py-4"><Video className="h-4 w-4" /> Video meeting</div>
          </div>
          <div className="space-y-4 p-6 text-[15px] leading-relaxed text-slate-700 md:p-8">
            {paras.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="pt-2 text-sm">
              <a className="underline" href="https://www.staffanchor.com/terms" target="_blank" rel="noopener noreferrer">Terms</a> {" | "}
              <a className="underline" href="https://www.staffanchor.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
            </p>
          </div>
        </section>

        {/* Pick, details, done */}
        <section className="h-fit rounded-3xl bg-white p-6 shadow-sm md:p-8">
          {step === "done" && done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h2 className="text-xl font-bold text-slate-900">You&apos;re booked</h2>
              <p className="text-[15px] text-slate-700">{longWhen(done.start)} IST</p>
              <p className="text-sm text-slate-500">
                A calendar invite{done.meetLink ? " with the Google Meet link" : ""} and a confirmation are on their way to {form.email}.
              </p>
              {done.meetLink && (
                <a href={done.meetLink} className="inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">Open meeting link</a>
              )}
            </div>
          ) : step === "details" ? (
            <div className="space-y-3">
              <button onClick={() => setStep("time")} className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Change time</button>
              <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700"><Clock className="h-4 w-4" /> {slot ? longWhen(slot) : ""} IST</p>
              <h2 className="pt-1 text-lg font-semibold text-slate-900">Your details</h2>
              <input className={field} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              <input className={field} placeholder="Email (the invite goes here)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
              <input className={field} placeholder="Mobile number" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
              <input className={field} placeholder="Role you are targeting (optional)" value={form.targetRole} onChange={(e) => setForm({ ...form, targetRole: e.target.value })} />
              <textarea className={field} rows={3} placeholder="Anything you'd like me to know (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <input className="hidden" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} aria-hidden="true" />
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" className="mt-1" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                <span>I agree to the <a className="underline" href="https://www.staffanchor.com/terms" target="_blank" rel="noopener noreferrer">Terms</a> and <a className="underline" href="https://www.staffanchor.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={pay} disabled={!detailsOk || busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-[15px] font-semibold text-white disabled:opacity-40">
                {busy ? "Please wait…" : `Pay ₹${service.price_inr.toLocaleString("en-IN")}`} {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-900">When should we meet?</h2>
              {!slots ? (
                <p className="text-sm text-slate-500">Loading available times…</p>
              ) : !slots.ok ? (
                <p className="text-sm text-red-600">{slots.error ?? "Times are unavailable right now."}</p>
              ) : dates.length === 0 ? (
                <p className="text-sm text-slate-500">No times are open right now. Please check back soon.</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <button aria-label="Earlier dates" onClick={() => setOffset((o) => Math.max(0, o - 5))} disabled={offset === 0} className="rounded-full bg-slate-100 p-2 disabled:opacity-30"><ArrowLeft className="h-4 w-4" /></button>
                    <div className="grid flex-1 grid-cols-5 gap-2">
                      {visible.map((d) => {
                        const p = dayParts(d);
                        return (
                          <button key={d} onClick={() => { setDate(d); setSlot(null); }} className={`rounded-xl border px-1 py-2.5 text-center text-sm ${date === d ? "border-amber-700 bg-amber-50 font-semibold text-amber-800" : "border-slate-200 text-slate-700 hover:border-slate-400"}`}>
                            <span className="block text-[13px]">{p.wd}</span>
                            <span className="block">{p.dm}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button aria-label="Later dates" onClick={() => setOffset((o) => Math.min(Math.max(0, dates.length - 5), o + 5))} disabled={offset + 5 >= dates.length} className="rounded-full bg-slate-100 p-2 disabled:opacity-30"><ArrowRight className="h-4 w-4" /></button>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Select time of day</h3>
                    <div className="flex flex-wrap gap-2">
                      {times.map((t) => (
                        <button key={t} onClick={() => setSlot(t)} className={`rounded-xl border px-4 py-3 text-sm ${slot === t ? "border-amber-700 bg-amber-50 font-semibold text-amber-800" : "border-slate-200 text-slate-700 hover:border-slate-400"}`}>
                          {timeLabel(t)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">All times are in India Standard Time (GMT+5:30).</p>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button onClick={() => { setError(null); setStep("details"); }} disabled={!slot} className="flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3.5 text-[15px] font-semibold text-white disabled:opacity-40">
                    Continue
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
