import { notFound, redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { reportForBooking } from "@/lib/session-report/store";

export const dynamic = "force-dynamic";

// "Session report" on a booking lands here: it finds the report for that booking (or makes it, filled from the booking and
// the details form) and opens the workspace.
export default async function StartSession({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const { booking } = await searchParams;
  const db = adminDb();
  if (!db || !booking || !/^[0-9a-f-]{36}$/i.test(booking)) notFound();
  const r = await reportForBooking(db, booking);
  if (!r) notFound();
  redirect(`/analytics/edge/session/${r.id}`);
}
