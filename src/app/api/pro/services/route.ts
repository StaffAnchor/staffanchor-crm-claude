import { NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";

export async function GET() {
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const { data } = await db.from("pro_services").select("slug, title, tagline, description, duration_min, price_inr, popular").eq("active", true).order("sort");
  return NextResponse.json({ ok: true, services: data ?? [] });
}
