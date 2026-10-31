import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { adminDb, formatIst, inr } from "@/lib/pro-sessions/core";
import { googleConfigured } from "@/lib/pro-sessions/google";
import AvailabilityEditor from "./availability-editor";
import ProposalHelper from "./proposal-helper";
import InvoiceControls, { type InvoiceInfo } from "../invoice-controls";
import NewSessionForm from "./new-session-form";
import NewCvForm from "./new-cv-form";
import { briefState } from "@/lib/cv-brief/state";
import { signedInvoiceUrl } from "@/lib/service-invoices";

export const dynamic = "force-dynamic";

type Booking = {
  id: string;
  service_slug: string;
  name: string;
  email: string;
  phone: string;
  target_role: string | null;
  slot_start: string;
  status: string;
  amount_inr: number;
  meet_link: string | null;
  calendar_error: string | null;
  source: string | null;
  created_at: string;
};

const GCAL_MSG: Record<string, string> = {
  connected: "Google Calendar connected.",
  notconfigured: "Google sign-in isn't set up yet (the two Google keys are missing).",
  failed: "Connecting Google Calendar didn't work. Please try again.",
  norefresh: "Google didn't return a permanent access token. Remove StaffAnchor from your Google account's connected apps and connect again.",
};

function Card({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {sub && <p className="mt-0.5 text-[12.5px] text-slate-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Called only after the page has started rendering data, so the clock read stays out of the render body.
function nowMs() {
  return Date.now();
}

export default async function ProSessionsAdmin({ searchParams }: { searchParams: Promise<{ gcal?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const db = adminDb();
  const [{ data: bookings }, { data: windows }, { data: settings }, { data: conn }, { data: services }] = await Promise.all([
    supabase.from("pro_bookings").select("*").neq("status", "failed").order("slot_start", { ascending: false }).limit(60),
    supabase.from("pro_availability").select("weekday, start_time, end_time").order("weekday"),
    db ? db.from("pro_settings").select("min_notice_hours, horizon_days").eq("id", 1).maybeSingle() : Promise.resolve({ data: null }),
    db ? db.from("google_calendar_connection").select("email, connected_at").eq("id", 1).maybeSingle() : Promise.resolve({ data: null }),
    db ? db.from("pro_services").select("slug, title, duration_min, price_inr").order("sort") : Promise.resolve({ data: [] }),
  ]);
  // pro_availability has no read policy for staff, so fall back to the service client for the editor.
  const win = windows && windows.length ? windows : db ? ((await db.from("pro_availability").select("weekday, start_time, end_time").order("weekday")).data ?? []) : [];
  const rows = (bookings ?? []) as Booking[];
  const invoices: Record<string, InvoiceInfo> = {};
  if (db && rows.length) {
    const { data: inv } = await db.from("service_invoices").select("*").eq("kind", "edge").in("ref_id", rows.map((r) => r.id));
    for (const i of inv ?? []) {
      invoices[i.ref_id as string] = { id: i.id, number: i.invoice_number, url: await signedInvoiceUrl(db, i.pdf_path), sentAt: i.sent_at, sentTo: i.sent_to, email: i.customer_email };
    }
  }
  const { data: reportRows } = db ? await db.from("session_reports").select("id, booking_id, candidate_name, track, status, updated_at, sent_at").order("updated_at", { ascending: false }).limit(12) : { data: [] };
  const reports = (reportRows ?? []) as { id: string; booking_id: string | null; candidate_name: string; track: string; status: string; updated_at: string; sent_at: string | null }[];
  const reportOf = new Map(reports.filter((r) => r.booking_id).map((r) => [r.booking_id as string, r]));
  const { data: cvRows } = db ? await db.from("cv_briefs").select("id, booking_id, name, status, updated_at, submitted_at, opened_at, created_at, last_reminded_at, reminder_count").order("updated_at", { ascending: false }).limit(12) : { data: [] };
  const cvForms = (cvRows ?? []) as { id: string; booking_id: string | null; name: string; status: "sent" | "started" | "submitted"; updated_at: string; submitted_at: string | null; opened_at: string | null; created_at: string; last_reminded_at: string | null; reminder_count: number }[];
  const cvOf = new Map(cvForms.filter((r) => r.booking_id).map((r) => [r.booking_id as string, r]));
  const cvNow = nowMs();
  const cvState = (r: (typeof cvForms)[number]) => briefState(r, cvNow);
  const paid = rows.filter((b) => b.status === "paid");
  const linked = !!process.env.PRO_INTERNAL_SECRET;
  const gc = googleConfigured();

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-5 py-8">
      <div>
        <h1 className="ros-page-title">StaffAnchor Edge</h1>
        <p className="mt-1 text-[13px] text-slate-500">Paid 1:1 sessions for jobseekers (mock interview, job search strategy, resume): what is booked, when you are free, and replies to LinkedIn requests.</p>
      </div>
      {sp.gcal && <p className="rounded-lg bg-slate-100 px-3 py-2 text-[13px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{GCAL_MSG[sp.gcal] ?? sp.gcal}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Google Calendar">
          {conn ? (
            <p className="text-[13px] text-emerald-700 dark:text-emerald-300">Connected{conn.email ? ` as ${conn.email}` : ""}. Free times come from your calendars, and each booking creates a Meet event.</p>
          ) : (
            <p className="text-[13px] text-amber-700 dark:text-amber-300">Not connected. Times come from the weekly windows only and no calendar event is created.</p>
          )}
          <Link href="/api/admin/google-calendar/connect" className="mt-3 inline-block text-[13px] font-medium text-teal-600 hover:underline">
            {conn ? "Reconnect" : gc ? "Connect Google Calendar →" : "Needs the Google keys first"}
          </Link>
        </Card>
        <Card title="Payments (Razorpay)">
          <p className={`text-[13px] ${linked ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
            {linked ? "Payments are taken on jobs.staffanchor.com with your existing Razorpay account, then confirmed here." : "The link to jobs.staffanchor.com isn't set up yet (PRO_INTERNAL_SECRET is missing)."}
          </p>
        </Card>
        <Card title="Bookings">
          <p className="text-[24px] font-semibold tabular-nums">{paid.length}</p>
          <p className="text-[12.5px] text-slate-500">paid, worth {inr(paid.reduce((a, b) => a + b.amount_inr, 0))}</p>
        </Card>
      </div>

      <Card title="Session reports" sub="Open one during the meeting, fill it in as you talk, and it makes a PDF for the candidate. Start it from a booking below, or here for someone who did not book through the site.">
        <NewSessionForm />
        {reports.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-[13px] dark:divide-slate-800">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/analytics/edge/session/${r.id}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">{r.candidate_name}</Link>
                <span className="text-xs text-slate-500">{r.track === "sales" ? "Sales" : "Non-sales"} · {r.status === "final" ? "Final" : "Draft"}{r.sent_at ? " · sent" : ""} · updated {new Date(r.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Candidate CV forms" sub="A private link the candidate fills in (about 10 to 15 minutes) with their sales career, numbers and what they want next, so you can write a stronger CV. Make it from a booking below, or here for someone who did not book through the site.">
        <NewCvForm />
        {cvForms.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-[13px] dark:divide-slate-800">
            {cvForms.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/analytics/edge/cv/${r.id}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">{r.name}</Link>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${cvState(r).cls}`}>{cvState(r).label}</span>
                  {cvState(r).nudge && <span className="font-medium text-red-700 dark:text-red-300">Needs a nudge</span>}
                  <span>updated {new Date(r.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Booking pages" sub="Share these. The StaffAnchor Edge pages on both websites link to the same ones.">
        <ul className="space-y-1 text-[13px]">
          {(services ?? []).map((s: { slug: string; title: string; duration_min: number; price_inr: number }) => (
            <li key={s.slug}>
              <span className="font-medium">{s.title}</span> · {s.duration_min} min · {inr(s.price_inr)} ·{" "}
              <a className="text-teal-600 hover:underline" href={`https://jobs.staffanchor.com/edge/book/${s.slug}`} target="_blank">jobs.staffanchor.com/edge/book/{s.slug}</a>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Reply to a LinkedIn request" sub="Paste the project details from a LinkedIn Services request. It drafts a proposal with the right session link, ready to paste into LinkedIn.">
        <ProposalHelper />
      </Card>

      <Card title="When you are free" sub="Weekly windows, in India time. A session is booked only where it fits inside a window and your calendar is free.">
        <AvailabilityEditor
          initial={(win as { weekday: number; start_time: string; end_time: string }[]).map((w) => ({ weekday: w.weekday, start: w.start_time.slice(0, 5), end: w.end_time.slice(0, 5) }))}
          minNoticeHours={settings?.min_notice_hours ?? 3}
          horizonDays={settings?.horizon_days ?? 21}
        />
      </Card>

      <Card title="Sessions">
        {rows.length === 0 ? (
          <p className="text-[13px] text-slate-500">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="py-1.5 pr-3 font-medium">When (IST)</th>
                  <th className="py-1.5 pr-3 font-medium">Session</th>
                  <th className="py-1.5 pr-3 font-medium">Who</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2 pr-3 tabular-nums">{formatIst(new Date(b.slot_start))}</td>
                    <td className="py-2 pr-3">{b.service_slug.replace(/-/g, " ")}<div className="text-xs text-slate-400">{inr(b.amount_inr)}</div></td>
                    <td className="py-2 pr-3">
                      {b.name}
                      <div className="text-xs text-slate-400">{b.email} · {b.phone}{b.target_role ? ` · ${b.target_role}` : ""}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={b.status === "paid" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}>{b.status === "paid" ? "Paid" : b.status === "pending_payment" ? "Awaiting payment" : b.status}</span>
                      {b.meet_link && <div><a className="text-xs text-teal-600 hover:underline" href={b.meet_link} target="_blank">Meet link</a></div>}
                      {b.calendar_error && <div className="text-xs text-amber-700">{b.calendar_error}</div>}
                      {b.status === "paid" && <div className="mt-1.5"><InvoiceControls kind="edge" refId={b.id} invoice={invoices[b.id] ?? null} /></div>}
                      {b.status === "paid" && <div className="mt-1.5"><Link href={`/analytics/edge/session/start?booking=${b.id}`} className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400">{reportOf.get(b.id) ? "Open session report →" : "Start session report →"}</Link></div>}
                      {b.status === "paid" && <div className="mt-1"><Link href={`/analytics/edge/cv/start?booking=${b.id}`} className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400">{cvOf.get(b.id) ? `CV form (${cvState(cvOf.get(b.id)!).label.toLowerCase()}) →` : "CV form →"}</Link></div>}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{b.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
