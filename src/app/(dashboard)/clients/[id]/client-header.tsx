import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";

export type HeaderShared = { mandateId: string; feedback: string | null; sharedAt: string | null; decidedAt: string | null; interviewRequested: boolean; interviewConfirmed: boolean };
export type HeaderInvoice = { invoiceDate: string | null; net: number | null; gross: number | null; currency: string | null };
export type HeaderRole = { id: string; status: string; title: string | null };
export type HeaderContact = { name: string; designation: string | null; email: string | null; phone: string | null };

const nowMs = () => Date.now();
const DAY = 86_400_000;
const STALE_DAYS = 4;

const ago = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = Math.max(0, Math.floor((nowMs() - new Date(iso).getTime()) / DAY));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const inr = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(n >= 1000000 ? 1 : 2).replace(/\.?0+$/, "")}L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
const digits = (p: string | null) => (p ?? "").replace(/\D/g, "").slice(-10);

function Stat({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string | null; tone?: "neutral" | "warn" | "good" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[12px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold leading-none tabular-nums ${tone === "warn" ? "text-amber-700 dark:text-amber-300" : tone === "good" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[12px] leading-4 text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

// How the relationship with this client stands, at a glance: roles, who is waiting on whom, where candidates are, what has
// been billed, when we last moved, and the one thing to do next. Everything is read from data the page already has.
export default function ClientHeader({
  roles,
  shared,
  stages,
  invoices,
  contact,
  feePercentage,
}: {
  roles: HeaderRole[];
  shared: HeaderShared[];
  stages: (string | null)[];
  invoices: HeaderInvoice[];
  contact: HeaderContact | null;
  feePercentage: number | null;
}) {
  const open = roles.filter((r) => r.status === "open");
  const sharedOn = new Set(shared.map((s) => s.mandateId));
  const openNotShared = open.filter((r) => !sharedOn.has(r.id));
  const waiting = shared.filter((s) => !s.feedback && s.sharedAt && nowMs() - new Date(s.sharedAt).getTime() > STALE_DAYS * DAY);
  const oldestWaiting = waiting.length ? Math.max(...waiting.map((w) => Math.floor((nowMs() - new Date(w.sharedAt!).getTime()) / DAY))) : 0;
  const interviewsAsked = shared.filter((s) => s.interviewRequested && !s.interviewConfirmed).length;
  const interviewsSet = shared.filter((s) => s.interviewConfirmed).length;
  const offers = stages.filter((s) => s === "offer").length;
  const placed = stages.filter((s) => s === "placed").length;
  const lastShared = shared.map((s) => s.sharedAt).filter(Boolean).sort().pop() ?? null;
  const lastFeedback = shared.map((s) => s.decidedAt).filter(Boolean).sort().pop() ?? null;

  const inrInvoices = invoices.filter((i) => !i.currency || i.currency.toUpperCase() === "INR");
  const billed = inrInvoices.reduce((a, i) => a + Number(i.net ?? i.gross ?? 0), 0);
  const lastInvoice = invoices.map((i) => i.invoiceDate).filter(Boolean).sort().pop() ?? null;
  const yearAgo = new Date(nowMs() - 365 * DAY).toISOString().slice(0, 10);
  const billed12 = inrInvoices.filter((i) => (i.invoiceDate ?? "") >= yearAgo).reduce((a, i) => a + Number(i.net ?? i.gross ?? 0), 0);

  // The one thing to do next, most pressing first.
  const next =
    waiting.length > 0
      ? { text: `${waiting.length} ${waiting.length === 1 ? "person has" : "people have"} waited ${STALE_DAYS}+ days for the client's feedback (the longest ${oldestWaiting} days). Follow up.`, href: "#portal", cta: "See who" }
      : interviewsAsked > 0
        ? { text: `${interviewsAsked} interview ${interviewsAsked === 1 ? "request needs" : "requests need"} a confirmed time.`, href: "/interviews", cta: "Open interviews" }
        : open.length > 0 && openNotShared.length > 0
          ? { text: `${openNotShared.length} open ${openNotShared.length === 1 ? "role has" : "roles have"} nobody shared with the client yet.`, href: "#roles", cta: "See the roles" }
          : null;

  const attention = waiting.length > 0 || interviewsAsked > 0;
  const phone = digits(contact?.phone ?? null);
  const bits = [
    lastShared && `Last shared candidates ${ago(lastShared)}`,
    lastFeedback && `last client decision ${ago(lastFeedback)}`,
    lastInvoice && `last invoice ${new Date(lastInvoice).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
  ].filter(Boolean);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Roles" value={`${open.length} open`} sub={`${roles.length} in all${openNotShared.length > 0 ? `, ${openNotShared.length} with nobody shared yet` : ""}`} />
        <Stat
          label="Waiting on the client"
          value={String(waiting.length)}
          tone={waiting.length > 0 ? "warn" : "good"}
          sub={waiting.length > 0 ? `No answer after ${STALE_DAYS}+ days. Longest ${oldestWaiting} days.` : shared.length > 0 ? "Nobody is overdue" : "Nobody shared yet"}
        />
        <Stat
          label="Moving through"
          value={`${shared.length} shared`}
          sub={`${interviewsSet} interviews set${interviewsAsked > 0 ? `, ${interviewsAsked} asked for` : ""} · ${offers} offers · ${placed} placed`}
        />
        <Stat
          label="Billed"
          value={invoices.length > 0 ? inr(billed) : "Nothing yet"}
          tone={invoices.length > 0 ? "good" : "neutral"}
          sub={invoices.length > 0 ? `${inr(billed12)} in the last 12 months · ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}${feePercentage != null ? ` · fee ${feePercentage}%` : ""}` : feePercentage != null ? `Fee ${feePercentage}%` : "Fee not set"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] dark:border-slate-700 dark:bg-slate-900">
        <span className={`h-2 w-2 shrink-0 rounded-full ${attention ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden />
        <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
          {next ? <><b className="font-semibold">Next:</b> {next.text}</> : <span className="text-slate-500">Nothing needs doing for this client right now.</span>}
          {bits.length > 0 && <span className="block text-[12px] text-slate-400">{bits.join(" · ")}</span>}
        </span>
        {next && (
          <a href={next.href.startsWith("#") ? next.href : undefined} className="shrink-0">
            {next.href.startsWith("#") ? <span className="rounded-full bg-teal-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-teal-700">{next.cta}</span> : <Link href={next.href} className="rounded-full bg-teal-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-teal-700">{next.cta}</Link>}
          </a>
        )}
        {contact && (
          <span className="flex shrink-0 items-center gap-1.5 border-l border-slate-200 pl-4 dark:border-slate-700">
            <span className="mr-1 hidden text-[12px] text-slate-500 sm:inline">{contact.name}</span>
            {phone.length === 10 && (
              <>
                <a href={`tel:+91${phone}`} title="Call" className="rounded-full border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"><Phone className="h-3.5 w-3.5" /></a>
                <a href={`https://wa.me/91${phone}`} target="_blank" rel="noopener noreferrer" title="WhatsApp (opens in WhatsApp)" className="rounded-full border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"><MessageCircle className="h-3.5 w-3.5" /></a>
              </>
            )}
            {contact.email && <a href={`mailto:${contact.email}`} title="Email" className="rounded-full border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"><Mail className="h-3.5 w-3.5" /></a>}
          </span>
        )}
      </div>
    </div>
  );
}
