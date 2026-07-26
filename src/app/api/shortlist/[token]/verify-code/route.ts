import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookieNameFor, signShortlistCookie } from "@/lib/shortlist-auth";

// Step 2 of the email-OTP gate: checks the 6-digit code against the most
// recent unconsumed, unexpired shortlist_access_codes row for this
// token+email, and on success sets the signed httpOnly cookie that
// /shortlist/[token]/page.tsx (and the passport sub-page) check before
// rendering anything.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { email, code } = await req.json();
  if (!email || !code) {
    return NextResponse.json({ error: "Enter the code sent to your email." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "This link isn't available right now. Please try again shortly." }, { status: 503 });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: row } = await admin
    .from("shortlist_access_codes")
    .select("id, expires_at, consumed_at")
    .eq("token", token)
    .ilike("email", String(email).trim())
    .eq("code", String(code).trim())
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "That code is incorrect or has expired. Request a new one." }, { status: 403 });
  }

  await admin.from("shortlist_access_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

  const { value, maxAge } = signShortlistCookie(token, String(email).trim());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieNameFor(token), value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/shortlist/${token}`,
    maxAge,
  });
  return res;
}
