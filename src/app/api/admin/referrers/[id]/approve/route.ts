import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { REFERRER_INVITE_TTL_MS, referrerMailConfigured, referrerSignupUrl, sendReferrerInviteEmail } from "@/lib/referrer-invite";

// Approving a sales_circle_referrers application mints an invite token +
// sends a set-password email -- the exact same mechanism
// api/admin/vendor-applications/[id]/approve/route.ts uses, just against
// referrer_signup instead of vendor-signup. Unlike the vendor flow there's
// no separate "application" vs "agency" entity here -- one referrer row
// covers the whole applied -> approved -> active lifecycle -- so this just
// updates the row in place rather than inserting a second record.

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
    .select("id, full_name, email, status")
    .eq("id", id)
    .single();
  if (!referrer) return NextResponse.json({ error: "Referrer not found" }, { status: 404 });
  if (referrer.status !== "applied") {
    return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + REFERRER_INVITE_TTL_MS).toISOString();

  const { error: updateError } = await supabase
    .from("sales_circle_referrers")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      invite_token: inviteToken,
      invite_token_expires_at: inviteTokenExpiresAt,
    })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const signupUrl = referrerSignupUrl(inviteToken);

  if (!referrerMailConfigured()) {
    return NextResponse.json({ ok: true, signupUrl, emailSent: false });
  }

  try {
    await sendReferrerInviteEmail({ to: referrer.email, name: referrer.full_name, signupUrl, reminder: false });
    return NextResponse.json({ ok: true, signupUrl, emailSent: true });
  } catch (err) {
    console.error("Referrer approval email send failed", err);
    return NextResponse.json({ ok: true, signupUrl, emailSent: false });
  }
}
