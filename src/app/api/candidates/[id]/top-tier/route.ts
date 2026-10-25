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

// Moving one person up to the top tier. Top tier means a strong sales person: 3+ years, pay-to-experience ratio of 1.5 or
// more, communication rated good on a call, and confirmed open to work in the last 90 days (see the candidate_top_tier view).
// Taps a recruiter can make, all started by a person pressing a button:
//   rate_communication  how they came across on a call: good, okay or weak
//   mark_open / not_now they told you they are, or are not, looking
//   email / whatsapp    the one-tap "are you open?" message, only for people who already pass the pay and experience check
// "preview" returns what each message would say so nothing goes out unseen.
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

  // The asks go only to people who pass the numbers, so the top tier is not diluted by messaging everyone.
  const { data: tierRow } = await admin.from("candidate_top_tier").select("is_sales, exp_ok, ratio_ok").eq("candidate_id", id).maybeSingle();
  const passes = !!tierRow && tierRow.is_sales && tierRow.exp_ok && tierRow.ratio_ok;

  if (body.action === "rate_communication") {
    const value = (body as { value?: string }).value;
    if (value !== "good" && value !== "okay" && value !== "weak") return NextResponse.json({ error: "Pick good, okay or weak." }, { status: 400 });
    const { error } = await admin.from("candidate_call_ratings").insert({ candidate_id: id, rated_by: user.id, communication: value });
    if (error) return NextResponse.json({ ok: false, error: "Couldn't save the rating." }, { status: 500 });
    await admin.from("audit_log").insert({ actor: user.id, action: "top_tier_rate_communication", entity: "candidate", entity_id: id, detail: { value } });
    return NextResponse.json({ ok: true, message: `Communication saved as ${value}.` });
  }

  if (body.action === "not_now") {
    const { error } = await admin.from("candidates").update({ not_now_until: new Date(Date.now() + 90 * 86_400_000).toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: "Couldn't save that." }, { status: 500 });
    await admin.from("audit_log").insert({ actor: user.id, action: "top_tier_not_now", entity: "candidate", entity_id: id, detail: { via: "recruiter" } });
    return NextResponse.json({ ok: true, message: "Marked as not looking for now. Rested for 90 days." });
  }

  if ((body.action === "email" || body.action === "whatsapp") && !passes) {
    return NextResponse.json({ ok: false, error: "This message only goes to sales people with 3+ years and a pay-to-experience ratio of 1.5 or more." });
  }

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
    return NextResponse.json({ ok: true, message: "Marked as open to work." });
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
