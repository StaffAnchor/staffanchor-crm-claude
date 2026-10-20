import type { SupabaseClient } from "@supabase/supabase-js";
import { HOLD_MINUTES, addDays, fromIst, isoWeekday, istDate } from "./core";
import { busyPeriods, getAccessToken } from "./google";

export type SlotsResult = {
  ok: boolean;
  calendarConnected: boolean;
  /** IST date -> start instants (ISO) that are free. */
  days: Record<string, string[]>;
  error?: string;
};

// Free start times for a service: the weekly windows, stepped by the session length, minus anything on the owner's
// calendars, minus sessions already booked or being paid for, minus the minimum-notice period.
export async function computeSlots(db: SupabaseClient, durationMin: number, fromDate: string, days: number): Promise<SlotsResult> {
  const [{ data: rules }, { data: settings }] = await Promise.all([
    db.from("pro_availability").select("weekday, start_time, end_time").eq("active", true),
    db.from("pro_settings").select("min_notice_hours, horizon_days").eq("id", 1).maybeSingle(),
  ]);
  const minNotice = settings?.min_notice_hours ?? 3;
  const horizon = settings?.horizon_days ?? 21;
  const span = Math.min(days, horizon);
  const now = new Date();
  const earliest = new Date(now.getTime() + minNotice * 3600 * 1000);
  const rangeStart = fromIst(fromDate, "00:00");
  const rangeEnd = fromIst(addDays(fromDate, span), "00:00");

  // Booking stays closed until the owner's Google Calendar is connected, so no one can pay for a time that
  // has not been checked against it.
  const token = await getAccessToken(db);
  if (!token) return { ok: false, calendarConnected: false, days: {}, error: "Booking opens very soon. Please check back shortly." };
  let busy: { start: Date; end: Date }[] = [];
  const b = await busyPeriods(token, rangeStart, rangeEnd);
  if (b === null) return { ok: false, calendarConnected: true, days: {}, error: "Availability is temporarily unavailable. Please try again in a few minutes." };
  busy = b;
  const holdFrom = new Date(now.getTime() - HOLD_MINUTES * 60000).toISOString();
  const { data: taken } = await db
    .from("pro_bookings")
    .select("slot_start, slot_end, status, created_at")
    .gte("slot_end", rangeStart.toISOString())
    .lte("slot_start", rangeEnd.toISOString())
    .or(`status.eq.paid,and(status.eq.pending_payment,created_at.gte.${holdFrom})`);
  for (const t of taken ?? []) busy.push({ start: new Date(t.slot_start), end: new Date(t.slot_end) });

  const out: Record<string, string[]> = {};
  for (let i = 0; i < span; i++) {
    const date = addDays(fromDate, i);
    const wd = isoWeekday(date);
    const times: string[] = [];
    for (const r of (rules ?? []).filter((x) => x.weekday === wd)) {
      const windowEnd = fromIst(date, r.end_time);
      for (let s = fromIst(date, r.start_time); s.getTime() + durationMin * 60000 <= windowEnd.getTime(); s = new Date(s.getTime() + durationMin * 60000)) {
        const e = new Date(s.getTime() + durationMin * 60000);
        if (s < earliest) continue;
        if (busy.some((b) => b.start < e && b.end > s)) continue;
        times.push(s.toISOString());
      }
    }
    if (times.length) out[date] = times.sort();
  }
  return { ok: true, calendarConnected: !!token, days: out };
}

export { istDate };
