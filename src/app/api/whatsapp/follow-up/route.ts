import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { followUpTemplate, oneLine, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { renderFollowUpMessage } from "@/lib/whatsapp-template-text";
import { phoneKey, WINDOW_MS } from "@/lib/whatsapp-threads";

export const runtime = "nodejs";

// Someone wrote to us and the 24-hour free-reply window has closed. WhatsApp then allows only an approved template, so
// this sends one that apologises for the delay and asks them to reply. Their reply opens a fresh 24 hours, and a recruiter
// continues in the same chat. A person reviews the message first (preview) and presses Send.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const template = followUpTemplate();
  if (!template) return NextResponse.json({ ok: false, needsTemplate: true, error: "The follow-up template isn't set up yet." });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const b = (await req.json().catch(() => ({}))) as { phone?: unknown; candidateId?: unknown; preview?: unknown };
  const key = phoneKey(typeof b.phone === "string" ? b.phone : null);
  if (!key || key.length !== 10) return NextResponse.json({ error: "That number isn't usable." }, { status: 400 });
  const candidateId = typeof b.candidateId === "string" && /^[0-9a-f-]{36}$/i.test(b.candidateId) ? b.candidateId : null;

  // If they wrote in the last 24 hours, no template is needed: just reply.
  const { data: recent } = await admin.from("whatsapp_messages").select("id").eq("direction", "inbound").ilike("to_phone", `%${key}`).gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString()).limit(1);
  if (recent && recent.length > 0) return NextResponse.json({ error: "Their chat window is still open. Reply to them directly." }, { status: 409 });

  const { data: contact } = await admin.from("whatsapp_contacts").select("opted_out, display_name").eq("phone_key", key).maybeSingle();
  if (contact?.opted_out) return NextResponse.json({ error: "They opted out of automatic messages." }, { status: 409 });
  // Not twice in a row: one follow-up in the last 48 hours is enough.
  const { data: already } = await admin.from("whatsapp_messages").select("id").eq("template_name", template).eq("status", "sent").ilike("to_phone", `%${key}`).gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString()).limit(1);
  if (already && already.length > 0) return NextResponse.json({ error: "A follow-up was already sent in the last 2 days. Wait for their reply." }, { status: 409 });

  let name: string | null = (contact?.display_name as string | null) ?? null;
  if (candidateId) {
    const { data: c } = await admin.from("candidates").select("full_name").eq("id", candidateId).maybeSingle();
    name = (c?.full_name as string | null) ?? name;
  }
  const first = oneLine((name ?? "").trim().split(/\s+/)[0] || "there");
  const text = renderFollowUpMessage(first);

  if (b.preview === true) {
    return NextResponse.json({ ok: true, preview: { route: "template", messages: [text], items: [], note: "Sent from StaffAnchor's number with the approved follow-up template. When they reply, the chat opens for 24 hours and you can write freely. Meta may charge for a template message." } });
  }

  const res = await sendWhatsAppTemplate({ to: key, templateName: template, bodyParams: [first] });
  await admin.from("whatsapp_messages").insert({ candidate_id: candidateId, direction: "outbound", to_phone: key, body_preview: text, status: res.ok ? "sent" : "failed", template_name: template, meta_message_id: res.ok ? res.metaMessageId : null, error: res.ok ? null : res.error, sent_by: user.id });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 200 });
  return NextResponse.json({ ok: true });
}
