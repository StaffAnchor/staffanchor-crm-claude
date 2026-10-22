import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyData, prefill, sanitize, type Level, type SessionData, type Track } from "./config";

export type ReportRow = {
  id: string; booking_id: string | null; candidate_name: string; candidate_email: string | null; candidate_phone: string | null;
  track: Track; level: Level; data: unknown; status: "draft" | "final"; created_at: string; updated_at: string; finalized_at: string | null; sent_at: string | null; sent_to: string | null;
};

export const COLUMNS = "id, booking_id, candidate_name, candidate_email, candidate_phone, track, level, data, status, created_at, updated_at, finalized_at, sent_at, sent_to";

/** The report for a paid booking, made (with the booking's and the details form's answers filled in) the first time it is opened. */
export async function reportForBooking(db: SupabaseClient, bookingId: string): Promise<ReportRow | null> {
  const { data: existing } = await db.from("session_reports").select(COLUMNS).eq("booking_id", bookingId).maybeSingle();
  if (existing) return existing as ReportRow;
  const { data: b } = await db.from("pro_bookings").select("id, name, email, phone, target_role, experience_years").eq("id", bookingId).maybeSingle();
  if (!b) return null;
  const { data: o } = await db.from("resume_orders").select("intake").eq("booking_id", bookingId).maybeSingle();
  const data: SessionData = prefill(b as { experience_years: number | null; target_role: string | null }, (o?.intake as Record<string, string> | null) ?? null);
  const { data: row, error } = await db.from("session_reports").insert({ booking_id: bookingId, candidate_name: b.name, candidate_email: b.email, candidate_phone: b.phone, data }).select(COLUMNS).single();
  if (error) {
    // Opened twice at once: the other one made it.
    const { data: again } = await db.from("session_reports").select(COLUMNS).eq("booking_id", bookingId).maybeSingle();
    return (again as ReportRow | null) ?? null;
  }
  return row as ReportRow;
}

export async function standaloneReport(db: SupabaseClient, input: { name: string; email?: string | null; phone?: string | null }): Promise<ReportRow | null> {
  const { data: row } = await db.from("session_reports").insert({ candidate_name: input.name.slice(0, 120), candidate_email: input.email || null, candidate_phone: input.phone || null, data: emptyData() }).select(COLUMNS).single();
  return (row as ReportRow | null) ?? null;
}

export const cleanData = (raw: unknown) => sanitize(raw);
