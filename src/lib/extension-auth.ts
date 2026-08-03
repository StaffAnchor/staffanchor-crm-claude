import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Shared auth helper for the two /api/extension/* routes the Chrome
// extension (LinkedIn "Save to StaffAnchor" capture) calls. Unlike every
// other API route in this app, the extension is a genuinely separate
// origin with no access to the CRM's own httpOnly session cookie -- it
// logs the recruiter in directly against Supabase's own auth REST API
// (password grant, using the public anon key) and holds the resulting
// access token in chrome.storage. These routes verify that token on every
// request instead of reading a cookie session.
//
// CORS is wide open (Access-Control-Allow-Origin: *) because the real gate
// here is the bearer token, not the origin -- a chrome-extension:// origin
// can't be pinned to a stable value across installs/users the way a web
// origin can, and Chrome's extension background/service-worker fetches are
// not subject to page-level CORS enforcement anyway when the extension has
// host_permissions for this domain. Belt-and-suspenders: still requiring a
// valid, role-checked bearer token on every call either way.
export const EXTENSION_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

export function corsJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { status: init?.status ?? 200, headers: EXTENSION_CORS_HEADERS });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: EXTENSION_CORS_HEADERS });
}

// Verifies the extension's bearer token against Supabase auth, then checks
// the profiles table for a permitted role -- same recruiter/admin/partner
// gate every other candidate-creating route in this app uses. Returns the
// authenticated user + their profile on success, or a ready-to-return
// NextResponse on failure (so callers can just `if (auth.error) return
// auth.error;`).
export async function requireExtensionUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) {
    return { error: corsJson({ error: "Missing bearer token. Please sign in via the extension popup." }, { status: 401 }) };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { error: corsJson({ error: "Not fully configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 }) };
  }

  const anonClient = createSupabaseClient(supabaseUrl, anonKey);
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(token);
  if (userError || !user) {
    return { error: corsJson({ error: "Your session expired -- please sign in again via the extension popup." }, { status: 401 }) };
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);
  const { data: profile } = await admin.from("profiles").select("id, role, full_name, email").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return { error: corsJson({ error: "Not permitted." }, { status: 403 }) };
  }

  return { user, profile, admin };
}
