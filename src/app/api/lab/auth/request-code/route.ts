import { NextRequest, NextResponse } from "next/server";
import { adminDb, EMAIL_RE, PRO_FROM } from "@/lib/pro-sessions/core";
import { hashCode, newCode } from "@/lib/lab/auth";
import { sendEmail, renderEmailShell } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Step 1 of sign-in. The answer never says whether the email is registered: it always reads "if you are registered,
// a code is on its way", so the form can't be used to find out who is in a cohort.
export async function POST(req: NextRequest) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const clean = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Sign-in isn't available right now." }, { status: 503 });
  const generic = NextResponse.json({ ok: true });

  const { data: member } = await db.from("lab_members").select("id, full_name").ilike("email", clean).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!member) return generic;

  // At most 5 codes an hour per person.
  const { count } = await db.from("lab_login_codes").select("id", { count: "exact", head: true }).eq("member_id", member.id).gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if ((count ?? 0) >= 5) return NextResponse.json({ ok: false, error: "Too many codes requested. Please try again in an hour." }, { status: 429 });

  const code = newCode();
  await db.from("lab_login_codes").insert({ member_id: member.id, code_hash: hashCode(code), expires_at: new Date(Date.now() + 10 * 60000).toISOString() });
  try {
    await sendEmail({
      to: clean,
      subject: "Your Sales Leaders Lab sign-in code",
      text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
      html: renderEmailShell({
        preheader: `Your sign-in code is ${code}.`,
        bodyHtml: `<p>Your Sales Leaders Lab sign-in code is <strong style="font-size:20px;letter-spacing:2px;">${code}</strong>.</p><p>It expires in 10 minutes.</p><p style="color:#94a3b8;font-size:12px;">If you didn't ask for it, you can ignore this email.</p>`,
      }),
      fromName: "StaffAnchor Sales Leaders Lab",
      fromEmail: PRO_FROM,
      replyTo: PRO_FROM,
    });
  } catch (e) {
    console.error("lab code email failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't send the code. Please try again." }, { status: 500 });
  }
  return generic;
}
