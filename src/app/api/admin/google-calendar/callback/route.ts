import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { exchangeCode } from "@/lib/pro-sessions/google";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const back = (q: string) => NextResponse.redirect(new URL(`/analytics/pro-sessions?${q}`, req.url));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("pro_gcal_state")?.value) return back("gcal=failed");
  const tokens = await exchangeCode(code, `${req.nextUrl.origin}/api/admin/google-calendar/callback`);
  if (!tokens?.refresh_token) return back("gcal=norefresh");
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from((tokens.id_token ?? "").split(".")[1] ?? "", "base64url").toString()).email ?? null;
  } catch {
    // the email is only for display
  }
  const db = adminDb();
  if (!db) return back("gcal=failed");
  await db.from("google_calendar_connection").upsert({ id: 1, email, refresh_token: tokens.refresh_token, connected_at: new Date().toISOString() });
  return back("gcal=connected");
}
