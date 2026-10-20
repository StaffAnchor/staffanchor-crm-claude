import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";

// Saves the weekly windows and booking limits.
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { windows?: { weekday: number; start: string; end: string }[]; minNoticeHours?: number; horizonDays?: number };
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const windows = (b.windows ?? []).filter((w) => w.weekday >= 1 && w.weekday <= 7 && time.test(w.start) && time.test(w.end) && w.start < w.end);
  await db.from("pro_availability").delete().not("id", "is", null);
  if (windows.length) await db.from("pro_availability").insert(windows.map((w) => ({ weekday: w.weekday, start_time: w.start, end_time: w.end })));
  await db.from("pro_settings").upsert({ id: 1, min_notice_hours: Math.min(168, Math.max(0, Number(b.minNoticeHours ?? 3))), horizon_days: Math.min(60, Math.max(1, Number(b.horizonDays ?? 21))) });
  return NextResponse.json({ ok: true });
}
