import { notFound, redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { briefForBooking } from "@/lib/cv-brief/store";

export const dynamic = "force-dynamic";

// "CV form" on a booking lands here: finds that candidate's form (or makes it, with what we already know) and opens it.
export default async function StartCvForm({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const { booking } = await searchParams;
  const db = adminDb();
  if (!db || !booking || !/^[0-9a-f-]{36}$/i.test(booking)) notFound();
  const r = await briefForBooking(db, booking);
  if (!r) notFound();
  redirect(`/analytics/edge/cv/${r.id}`);
}
