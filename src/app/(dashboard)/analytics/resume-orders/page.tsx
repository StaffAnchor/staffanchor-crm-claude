import { adminDb, inr } from "@/lib/pro-sessions/core";
import { TIERS, type TierKey } from "@/lib/resume-orders/core";
import OrderActions from "./order-actions";
import InvoiceControls, { type InvoiceInfo } from "../invoice-controls";
import { signedInvoiceUrl } from "@/lib/service-invoices";

export const dynamic = "force-dynamic";

type Order = {
  id: string;
  tier: TierKey;
  experience_years: number | null;
  amount_inr: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  paid_at: string | null;
  intake: Record<string, string> | null;
  cv_path: string | null;
  intake_at: string | null;
  draft_due_at: string | null;
  draft_sent_at: string | null;
  revisions_used: number;
  source: string | null;
  created_at: string;
};

const STATUS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid, details awaited",
  details_received: "Details received",
  draft_sent: "Draft sent",
  revision: "Revision asked",
  completed: "Completed",
};

const FIELD_LABEL: Record<string, string> = {
  currentRole: "Current role",
  currentCompany: "Current company",
  experience: "Years of experience",
  targetRole: "Target role",
  targetIndustry: "Target industries or companies",
  linkedin: "LinkedIn",
  achievements: "Key achievements",
  other: "Anything else",
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }) : "—");

// Called only after the page has been rendered, so the clock read stays out of the render body.
function nowMs() {
  return Date.now();
}

export default async function ResumeOrdersPage() {
  const db = adminDb();
  const { data } = db ? await db.from("resume_orders").select("*").neq("status", "failed").order("created_at", { ascending: false }).limit(100) : { data: [] };
  const orders = (data ?? []) as Order[];

  // Signed links to the uploaded resumes (valid for an hour).
  const cvUrl: Record<string, string> = {};
  if (db) {
    for (const o of orders) {
      if (o.cv_path) {
        const { data: s } = await db.storage.from("resume-orders").createSignedUrl(o.cv_path, 3600);
        if (s?.signedUrl) cvUrl[o.id] = s.signedUrl;
      }
    }
  }
  const invoices: Record<string, InvoiceInfo> = {};
  if (db && orders.length) {
    const { data: inv } = await db.from("service_invoices").select("*").eq("kind", "resume").in("ref_id", orders.map((o) => o.id));
    for (const i of inv ?? []) {
      invoices[i.ref_id as string] = { id: i.id, number: i.invoice_number, url: await signedInvoiceUrl(db, i.pdf_path), sentAt: i.sent_at, sentTo: i.sent_to, email: i.customer_email };
    }
  }
  const count = (f: (o: Order) => boolean) => orders.filter(f).length;
  const now = nowMs();
  const open = (o: Order) => ["paid", "details_received", "draft_sent", "revision"].includes(o.status);
  const overdue = (o: Order) => (o.status === "details_received" || o.status === "revision") && !!o.draft_due_at && new Date(o.draft_due_at).getTime() < now && !o.draft_sent_at;
  const paidTotal = orders.filter((o) => o.status !== "pending_payment").reduce((a, o) => a + o.amount_inr, 0);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-5 py-8">
      <div>
        <h1 className="ros-page-title">Resume orders</h1>
        <p className="mt-1 text-[13px] text-slate-500">Resume Writing bought on the website. Each order moves from paid, to details received, to draft sent, to completed.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Paid orders", v: String(count((o) => o.status !== "pending_payment")), n: inr(paidTotal) },
          { l: "Waiting for their details", v: String(count((o) => o.status === "paid")) },
          { l: "To write", v: String(count((o) => o.status === "details_received" || o.status === "revision")), n: `${count(overdue)} overdue` },
          { l: "Completed", v: String(count((o) => o.status === "completed")) },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[12px] text-slate-500">{s.l}</p>
            <p className="mt-0.5 text-[24px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{s.v}</p>
            {s.n && <p className="mt-1 text-xs text-slate-400">{s.n}</p>}
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        {orders.length === 0 ? (
          <p className="text-[13px] text-slate-500">No orders yet.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const t = TIERS[o.tier];
              const late = overdue(o);
              return (
                <details key={o.id} className="rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{o.name}</span>
                      <span className="ml-2 text-slate-400">{o.experience_years != null ? `${o.experience_years} yrs, ` : ""}{t.band} plan · {inr(o.amount_inr)} · ordered {day(o.created_at)}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      {open(o) && o.draft_due_at && !o.draft_sent_at && <span className={late ? "font-medium text-red-600" : "text-slate-500"}>First draft due {day(o.draft_due_at)}</span>}
                      <span className={o.status === "completed" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}>{STATUS[o.status] ?? o.status}</span>
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-[13px] dark:border-slate-800">
                    <p className="text-slate-600 dark:text-slate-300">
                      {o.email} · {o.phone}
                      {o.source ? ` · from ${o.source}` : ""}
                    </p>
                    {o.intake ? (
                      <dl className="grid gap-2 md:grid-cols-2">
                        {Object.entries(o.intake).filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className={k === "achievements" || k === "other" ? "md:col-span-2" : ""}>
                            <dt className="text-xs text-slate-400">{FIELD_LABEL[k] ?? k}</dt>
                            <dd className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-slate-400">They have not filled in the details form yet.</p>
                    )}
                    {cvUrl[o.id] && (
                      <a href={cvUrl[o.id]} target="_blank" className="text-teal-600 hover:underline">Download their current resume</a>
                    )}
                    {o.status !== "pending_payment" && <InvoiceControls kind="resume" refId={o.id} invoice={invoices[o.id] ?? null} />}
                    <OrderActions id={o.id} status={o.status} revisionsUsed={o.revisions_used} revisionsAllowed={t.revisions} />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
