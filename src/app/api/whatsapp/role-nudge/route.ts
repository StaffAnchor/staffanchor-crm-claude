import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate, roleNudgeTemplate, oneLine } from "@/lib/whatsapp";
import { supabaseStore } from "@/lib/whatsapp-bot/store";
import { phoneKey } from "@/lib/whatsapp-threads";
import { renderRoleNudgeMessage } from "@/lib/whatsapp-template-text";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PER_CALL = 20;
const WAIT_DAYS = 2;

// One reminder for people who were told about a role and have not answered after two days. A person presses the button
// after seeing the message; each person gets at most one reminder per role; anyone who opted out, has no usable number, or
// answered meanwhile is skipped. The reply buttons are the same as the first message, so a Yes still lands in the role's pipeline.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { mandateId?: unknown; preview?: unknown };
  const mandateId = typeof body.mandateId === "string" && /^[0-9a-f-]{36}$/i.test(body.mandateId) ? body.mandateId : "";
  if (!mandateId) return NextResponse.json({ error: "Missing role." }, { status: 400 });

  const templateName = roleNudgeTemplate();
  if (!templateName) return NextResponse.json({ ok: false, needsTemplate: true, error: "The reminder template isn't set up yet. It needs the approved template name in settings (WHATSAPP_TEMPLATE_ROLE_NUDGE)." });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const { data: mandate } = await supabase.from("mandates").select("role_title, city, cities").eq("id", mandateId).maybeSingle();
  if (!mandate) return NextResponse.json({ error: "That role could not be found." }, { status: 404 });
  const role = oneLine(String(mandate.role_title ?? "sales"));
  const cities = (mandate.cities as string[] | null) ?? [];
  const city = oneLine(cities[0] ?? (mandate.city as string | null) ?? "India");

  const cutoff = new Date(Date.now() - WAIT_DAYS * 86_400_000).toISOString();
  const { data: rows } = await admin
    .from("mandate_outreach")
    .select("candidate_id")
    .eq("mandate_id", mandateId)
    .eq("status", "sent")
    .is("nudged_at", null)
    .lt("sent_at", cutoff)
    .limit(200);
  const ids = ((rows ?? []) as { candidate_id: string }[]).map((r) => r.candidate_id);
  if (ids.length === 0) return NextResponse.json({ ok: true, preview: { recipients: 0, total: 0, sample: [] }, sent: 0, noPhone: 0, optedOut: 0, message: "Nobody is waiting for a reminder." });

  const { data: people } = await admin.from("candidates").select("id, full_name, phone, phone_hold").in("id", ids);
  const store = supabaseStore(admin);
  let noPhone = 0;
  let optedOut = 0;
  const eligible: { id: string; first: string; key: string }[] = [];
  for (const c of (people ?? []) as { id: string; full_name: string | null; phone: string | null; phone_hold: boolean | null }[]) {
    const key = phoneKey(c.phone);
    if (c.phone_hold || !key || key.length !== 10) {
      noPhone++;
      continue;
    }
    const contact = await store.getContact(key);
    if (contact?.opted_out) {
      optedOut++;
      continue;
    }
    eligible.push({ id: c.id, first: oneLine((c.full_name ?? "").trim().split(/\s+/)[0] || "there"), key });
  }

  if (body.preview === true) {
    return NextResponse.json({
      ok: true,
      preview: { recipients: Math.min(eligible.length, MAX_PER_CALL), total: eligible.length, sample: eligible.slice(0, 3).map((c) => renderRoleNudgeMessage(c.first, role, city)) },
      noPhone,
      optedOut,
    });
  }

  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const c of eligible.slice(0, MAX_PER_CALL)) {
    const res = await sendWhatsAppTemplate({ to: c.key, templateName, bodyParams: [c.first, role, city] });
    await store.logMessage({
      candidate_id: c.id,
      direction: "outbound",
      to_phone: c.key,
      body_preview: renderRoleNudgeMessage(c.first, role, city),
      status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
      template_name: templateName,
      meta_message_id: res.ok ? res.metaMessageId : null,
      error: res.ok ? null : res.error,
    });
    if (res.ok) {
      sent++;
      await admin.from("mandate_outreach").update({ nudged_at: new Date().toISOString() }).eq("mandate_id", mandateId).eq("candidate_id", c.id);
    } else {
      failed++;
      firstError = firstError ?? res.error;
      if (res.status === "not_configured") break;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  if (sent > 0) await admin.from("audit_log").insert({ actor: user.id, action: "role_nudge_whatsapp", entity: "mandate", entity_id: mandateId, detail: { sent, failed, template: templateName } });
  return NextResponse.json({ ok: true, sent, failed, noPhone, optedOut, remaining: Math.max(0, eligible.length - MAX_PER_CALL), error: firstError });
}
