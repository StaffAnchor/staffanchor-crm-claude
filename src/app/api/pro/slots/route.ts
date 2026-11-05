import { NextRequest, NextResponse } from "next/server";
import { adminDb, istDate, sessionLength } from "@/lib/pro-sessions/core";
import { computeSlots } from "@/lib/pro-sessions/slots";

export const dynamic = "force-dynamic";

// Free times for a service, from today for up to 21 days.
export async function GET(req: NextRequest) {
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const slug = req.nextUrl.searchParams.get("service") ?? "";
  const { data: svc } = await db.from("pro_services").select("duration_min, price_inr").eq("slug", slug).eq("active", true).maybeSingle();
  if (!svc) return NextResponse.json({ ok: false, error: "Unknown service" }, { status: 404 });
  const len = sessionLength(slug, svc.duration_min, svc.price_inr, req.nextUrl.searchParams.get("minutes"));
  if (!len) return NextResponse.json({ ok: false, error: "That session length isn't offered." }, { status: 400 });
  const r = await computeSlots(db, len.minutes, istDate(new Date()), 21, len.stepMin);
  return NextResponse.json(r, { status: r.ok ? 200 : 503 });
}
