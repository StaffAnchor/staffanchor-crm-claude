import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

// Fires alongside assign_mandate_staff (which already writes the in-app
// notification-bell row) to also email whoever was just staffed on a
// mandate, so vendors/freelancers who don't live in the CRM day-to-day
// still get told immediately, not just team members who check the bell.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { mandateId, freelancerId } = await req.json();
  if (!mandateId || !freelancerId) {
    return NextResponse.json({ error: "mandateId and freelancerId are required" }, { status: 400 });
  }

  const { data: mandate } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, show_client_name")
    .eq("id", mandateId)
    .single();
  if (!mandate) {
    return NextResponse.json({ error: "Mandate not found" }, { status: 404 });
  }

  const { data: person } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", freelancerId)
    .single();
  if (!person?.email) {
    return NextResponse.json({ error: "Assigned person has no email on file." }, { status: 400 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    // Don't fail the assignment over this -- the in-app notification already
    // landed, and the caller treats this route as best-effort anyway.
    return NextResponse.json({ ok: false, skipped: "Email sending not configured" });
  }

  const crmUrl = process.env.NEXT_PUBLIC_CRM_URL || "https://crm.staffanchor.com";
  const mandateUrl = `${crmUrl}/mandates/${mandateId}`;
  const clientLabel = mandate.client_name ?? "a client";

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"StaffAnchor" <${gmailUser}>`,
      to: person.email,
      subject: `You've been assigned: ${mandate.role_title ?? "a mandate"} (${clientLabel})`,
      text: `Hi ${person.full_name ?? ""},\n\nYou've been staffed on a mandate:\n\n${mandate.role_title ?? "Role"} -- ${clientLabel}\n\nOpen it here: ${mandateUrl}\n\nThanks,\nStaffAnchor Team`,
      html: `<p>Hi ${person.full_name ?? ""},</p><p>You've been staffed on a mandate:</p><p><strong>${mandate.role_title ?? "Role"}</strong> -- ${clientLabel}</p><p><a href="${mandateUrl}">Open it in the CRM</a></p><p>Thanks,<br/>StaffAnchor Team</p>`,
    });

    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "mandate_staff_assignment_email_sent",
      entity: "mandate",
      entity_id: mandateId,
      detail: { to: person.email, freelancer_id: freelancerId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Mandate staffing notification email failed", err);
    // Best-effort: swallow as a non-blocking failure, matching the
    // fire-and-forget contract the caller expects.
    return NextResponse.json({ ok: false, error: "Failed to send notification email" });
  }
}
