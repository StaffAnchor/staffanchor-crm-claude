import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { cleanData, COLUMNS, type ReportRow } from "@/lib/session-report/store";
import Workspace from "./workspace";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { currentRole: "Current role", currentCompany: "Current company", experience: "Years of experience", targetRole: "Target role", targetIndustry: "Target industries or companies", linkedin: "LinkedIn", achievements: "Key achievements", other: "Anything else" };

export default async function SessionWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await db.from("session_reports").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as ReportRow;

  // What the candidate told us when they booked and, for the combo, in the resume details form. For you only: it is never in the report.
  let booking: { service: string; slot: string | null; notes: string | null; targetRole: string | null; source: string | null } | null = null;
  let intake: { label: string; value: string }[] = [];
  if (r.booking_id) {
    const { data: b } = await db.from("pro_bookings").select("service_slug, slot_start, notes, target_role, source").eq("id", r.booking_id).maybeSingle();
    if (b) booking = { service: b.service_slug, slot: b.slot_start, notes: b.notes, targetRole: b.target_role, source: b.source };
    const { data: o } = await db.from("resume_orders").select("intake").eq("booking_id", r.booking_id).maybeSingle();
    intake = Object.entries((o?.intake ?? {}) as Record<string, string>).filter(([, v]) => v && String(v).trim()).map(([k, v]) => ({ label: LABEL[k] ?? k, value: String(v) }));
  }
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6">
      <Link href="/analytics/edge" className="text-xs text-slate-500 hover:text-slate-800">← StaffAnchor Edge</Link>
      <Workspace
        id={r.id}
        initial={{ name: r.candidate_name, email: r.candidate_email ?? "", phone: r.candidate_phone ?? "", track: r.track, level: r.level, data: cleanData(r.data), status: r.status, sentAt: r.sent_at, sentTo: r.sent_to }}
        booking={booking}
        intake={intake}
      />
    </div>
  );
}
