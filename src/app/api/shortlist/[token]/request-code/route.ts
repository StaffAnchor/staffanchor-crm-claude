import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { generateSixDigitCode } from "@/lib/shortlist-auth";

// Step 1 of the email-OTP gate in front of the no-login /shortlist/[token]
// link: the visitor types the email address their StaffAnchor recruiter
// registered them under, we check that email is actually a client_contacts
// row for the client this mandate belongs to, then email a 6-digit code.
// Anyone can call this route with any token+email, but it never confirms or
// denies anything more than "a code was sent if this email is registered" --
// no candidate/mandate/client data is exposed here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { email } = await req.json();
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "This link isn't available right now. Please try again shortly." }, { status: 503 });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: tokenRow } = await admin.from("shortlist_tokens").select("mandate_id").eq("token", token).maybeSingle();
  if (!tokenRow) {
    return NextResponse.json({ error: "This shortlist link is no longer valid." }, { status: 404 });
  }
  const { data: mandate } = await admin.from("mandates").select("client_id").eq("id", tokenRow.mandate_id).single();
  if (!mandate?.client_id) {
    return NextResponse.json({ error: "This shortlist link is no longer valid." }, { status: 404 });
  }

  const { data: contact } = await admin
    .from("client_contacts")
    .select("id")
    .eq("client_id", mandate.client_id)
    .ilike("email", email.trim())
    .maybeSingle();
  if (!contact) {
    return NextResponse.json(
      { error: "That email isn't registered as a contact for this shortlist. Ask your StaffAnchor recruiter to add it, or double-check the address." },
      { status: 403 }
    );
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email sending isn't configured yet. Please contact your StaffAnchor recruiter." }, { status: 503 });
  }

  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await admin.from("shortlist_access_codes").insert({ token, email: email.trim(), code, expires_at: expiresAt });

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({
      from: `"StaffAnchor" <${gmailUser}>`,
      to: email.trim(),
      subject: "Your StaffAnchor shortlist access code",
      text: `Your access code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `<p>Your access code is <strong style="font-size:20px;letter-spacing:2px;">${code}</strong>.</p><p>It expires in 10 minutes.</p><p style="color:#94a3b8;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>`,
    });
  } catch (err) {
    console.error("Shortlist access code email failed", token, err);
    return NextResponse.json({ error: "Couldn't send the code. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
