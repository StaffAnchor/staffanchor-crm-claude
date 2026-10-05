import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailShell } from "@/lib/mail";

export const runtime = "nodejs";

// When a recruiter confirms (or changes) an interview time, tell the client:
// that's the one internal action a client is actually waiting on. Sends every
// person with portal access for that client the time, with a calendar invite.
const IST = "Asia/Kolkata";
const fmt = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true }) + " IST";
const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { linkId } = (await req.json().catch(() => ({}))) as { linkId?: string };
  if (!linkId) return NextResponse.json({ error: "linkId is required" }, { status: 400 });

  const { data: link } = await supabase
    .from("candidate_mandate_links")
    .select("id, confirmed_interview_at, candidates(full_name), mandates(role_title, client_id, client_name)")
    .eq("id", linkId)
    .single();
  const when = link?.confirmed_interview_at ? new Date(link.confirmed_interview_at as string) : null;
  const cand = link?.candidates as unknown as { full_name: string } | null;
  const mand = link?.mandates as unknown as { role_title: string; client_id: string | null; client_name: string | null } | null;
  if (!link || !when || !cand || !mand?.client_id) return NextResponse.json({ ok: true, sent: 0, skipped: "Nothing to send" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ ok: false, skipped: "Not configured" });
  const admin = createSupabaseClient(url, serviceKey);
  const { data: people } = await admin.from("client_users").select("email").eq("client_id", mand.client_id);
  const to = (people ?? []).map((p) => p.email as string).filter(Boolean);
  if (to.length === 0) return NextResponse.json({ ok: true, sent: 0, skipped: "No portal users for this client" });

  const end = new Date(when.getTime() + 60 * 60 * 1000);
  const summary = `Interview: ${cand.full_name} for ${mand.role_title}`;
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StaffAnchor//Interviews//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${link.id}@staffanchor.com`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(when)}`,
    `DTEND:${ics(end)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(`Arranged by ${profile.full_name ?? "StaffAnchor"}. Your recruiter will share the joining details.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const whenText = fmt(when);
  try {
    await sendEmail({
      to: to.join(", "),
      subject: `Interview confirmed: ${cand.full_name} for ${mand.role_title}, ${whenText}`,
      text: `Hi,\n\nThe interview with ${cand.full_name} for ${mand.role_title} is confirmed for ${whenText}.\n\nA calendar invite is attached. Your StaffAnchor recruiter will share any joining details.\n\nThanks,\n${profile.full_name ?? "StaffAnchor Team"}`,
      html: renderEmailShell({
        preheader: `Interview with ${cand.full_name} confirmed for ${whenText}.`,
        bodyHtml: `<p>Hi,</p><p>The interview with <strong>${cand.full_name}</strong> for <strong>${mand.role_title}</strong> is confirmed for:</p><p style="font-size:16px;color:#0F172A;"><strong>${whenText}</strong></p><p>A calendar invite is attached. Your StaffAnchor recruiter will share any joining details.</p><p>Thanks,<br/>${profile.full_name ?? "StaffAnchor Team"}</p>`,
      }),
      attachments: [{ filename: "interview.ics", content: Buffer.from(calendar), contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
    });
  } catch (err) {
    console.error("Interview-confirmed email failed", linkId, err);
    return NextResponse.json({ error: "Could not send the confirmation email." }, { status: 500 });
  }

  await supabase.from("audit_log").insert({ actor: user.id, action: "interview_confirmation_emailed", entity: "candidate_mandate_links", entity_id: linkId, detail: { to, at: when.toISOString() } });
  return NextResponse.json({ ok: true, sent: to.length });
}
