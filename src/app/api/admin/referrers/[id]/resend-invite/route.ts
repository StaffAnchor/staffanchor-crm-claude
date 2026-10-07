import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { REFERRER_INVITE_TTL_MS, referrerMailConfigured, referrerSignupUrl, sendReferrerInviteEmail } from "@/lib/referrer-invite";

// Sends an approved referrer a fresh joining link. Every call mints a new
// token, so the old link stops working (a forwarded or stale link can't be
// used once a new one is out). Only for people who were approved but have
// not yet set up their account; once they've joined there is nothing to resend.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { data: referrer } = await supabase
    .from("sales_circle_referrers")
    .select("id, full_name, email, status, tos_accepted_at")
    .eq("id", id)
    .single();
  if (!referrer) return NextResponse.json({ error: "Referrer not found" }, { status: 404 });
  if (referrer.status !== "approved") {
    return NextResponse.json({ error: "Only approved referrers can be sent a joining link." }, { status: 409 });
  }
  if (referrer.tos_accepted_at) {
    return NextResponse.json({ error: "This person has already joined, so there is no link to resend." }, { status: 409 });
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + REFERRER_INVITE_TTL_MS).toISOString();
  const { error: updateError } = await supabase
    .from("sales_circle_referrers")
    .update({ invite_token: inviteToken, invite_token_expires_at: expiresAt })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const signupUrl = referrerSignupUrl(inviteToken);
  if (!referrerMailConfigured()) return NextResponse.json({ ok: true, signupUrl, emailSent: false, expiresAt });

  try {
    await sendReferrerInviteEmail({ to: referrer.email, name: referrer.full_name, signupUrl, reminder: true });
    return NextResponse.json({ ok: true, signupUrl, emailSent: true, email: referrer.email, expiresAt });
  } catch (err) {
    console.error("Referrer invite resend failed", err);
    // The new link is already saved, so hand it back to be copied and sent another way.
    return NextResponse.json({ ok: true, signupUrl, emailSent: false, expiresAt });
  }
}
