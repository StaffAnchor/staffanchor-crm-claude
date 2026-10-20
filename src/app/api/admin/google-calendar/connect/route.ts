import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { GOOGLE_SCOPES, googleConfigured } from "@/lib/pro-sessions/google";

// Starts the one-time "connect my Google Calendar" sign-in for Pro Sessions.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!googleConfigured()) return NextResponse.redirect(new URL("/analytics/edge?gcal=notconfigured", req.url));
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${req.nextUrl.origin}/api/admin/google-calendar/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    login_hint: "gagan@staffanchor.com",
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("pro_gcal_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/admin/google-calendar" });
  return res;
}
