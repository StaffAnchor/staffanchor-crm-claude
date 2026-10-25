import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildReactivationEmail } from "@/lib/campaign-emails";
import { emailRoom, sendBatch } from "@/lib/campaign-send";
import { sendWhatsAppBatch } from "@/lib/campaign-whatsapp";
import { oneLine, reactivationTemplate } from "@/lib/whatsapp";
import { renderReactivationMessage } from "@/lib/whatsapp-template-text";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;
const REST_DAYS = 30;

// Moving one person up to the top tier: someone is "top tier" once their profile is ready AND they have confirmed they are
// open to work in the last 90 days. Three ways to get that confirmation, all started by a person pressing a button:
//   mark_open  you spoke to them and they said so
//   email      the one-tap "are you open?" email (they tap Yes, which records it)
//   whatsapp   the approved reactivation template, once it is set up
// "preview" returns what each would say so nothing goes out unseen.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const { data: c } = await admin.from("candidates").select("id, full_name, email, phone, phone_hold").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  const first = oneLine((c.full_name ?? "").trim().split(/\s+/)[0] || "there");
  const email = typeof c.email === "string" && c.email.includes("@") ? c.email : null;
  const template = reactivationTemplate();
  const hasPhone = !!c.phone && !(c as { phone_hold?: boolean }).phone_hold;
  const sinceRest = new Date(Date.now() - REST_DAYS * 86_400_000).toISOString();
  const { data: recent } = await admin.from("profile_outreach").select("created_at").eq("candidate_id", id).eq("channel", "email").eq("status", "sent").gte("created_at", sinceRest).limit(1);
  const emailedRecently = (recent ?? []).length > 0;

  if (body.action === "preview") {
    const mail = buildReactivationEmail({ id, full_name: c.full_name }, "sales");
    return NextResponse.json({
      ok: true,
      email: email ? { available: !emailedRecently, why: emailedRecently ? `They were emailed in the last ${REST_DAYS} days.` : null, subject: mail.subject, text: mail.text } : { available: false, why: "No email on file.", subject: null, text: null },
      whatsapp: template && hasPhone ? { available: true, why: null, text: renderReactivationMessage(first) } : { available: false, why: !template ? "The WhatsApp template for this isn't set up yet." : "No usable phone number.", text: null },
    });
  }

  if (body.action === "mark_open") {
    const { error } = await admin.from("candidates").update({ open_to_work_at: new Date().toISOString(), not_now_until: null }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: "Couldn't save that." }, { status: 500 });
    await admin.from("audit_log").insert({ actor: user.id, action: "top_tier_mark_open", entity: "candidate", entity_id: id, detail: { via: "recruiter" } });
    return NextResponse.json({ ok: true, message: "Marked as open to work. They now count for the top tier." });
  }

  if (body.action === "email") {
    if (!email) return NextResponse.json({ ok: false, error: "No email on file." });
    if (emailedRecently) return NextResponse.json({ ok: false, error: `They were emailed in the last ${REST_DAYS} days. Give it a rest.` });
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return NextResponse.json({ ok: false, error: "Email sending isn't configured." });
    const { room, cap } = await emailRoom(admin);
    if (room <= 0) return NextResponse.json({ ok: false, error: `Today's email limit of ${cap} is used up. It frees up over 24 hours.` });
    const r = await sendBatch(admin, user.id, "reactivation", [{ id, full_name: c.full_name, email }], (p) => buildReactivationEmail(p, "sales"), ["top_tier"]);
    await admin.from("audit_log").insert({ actor: user.id, action: "top_tier_ask_email", entity: "candidate", entity_id: id, detail: { sent: r.sent, failed: r.failed } });
    return NextResponse.json(r.sent > 0 ? { ok: true, message: "Email sent. When they tap Yes, they move into the top tier." } : { ok: false, error: r.note ?? "The email didn't go out." });
  }

  if (body.action === "whatsapp") {
    if (!template) return NextResponse.json({ ok: false, needsTemplate: true, error: "The WhatsApp template for this isn't set up yet." });
    if (!hasPhone) return NextResponse.json({ ok: false, error: "No usable phone number." });
    const r = await sendWhatsAppBatch(admin, template, [{ id, first, phone: c.phone as string, bodyParams: [first], preview: renderReactivationMessage(first) }]);
    await admin.from("audit_log").insert({ actor: user.id, action: "top_tier_ask_whatsapp", entity: "candidate", entity_id: id, detail: { sent: r.sent, failed: r.failed, skipped: r.skipped } });
    return NextResponse.json(r.sent > 0 ? { ok: true, message: "WhatsApp sent. When they tap Yes, they move into the top tier." } : { ok: false, error: r.skipped ? "They opted out of messages or the number isn't usable." : r.error ?? "The message didn't go out." });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
