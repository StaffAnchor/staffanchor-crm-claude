import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate, roleOpportunityTemplate, oneLine } from "@/lib/whatsapp";
import { supabaseStore } from "@/lib/whatsapp-bot/store";
import { phoneKey } from "@/lib/whatsapp-threads";
import { renderOpportunityMessage } from "@/lib/whatsapp-template-text";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PER_CALL = 20;
const RECENT_DAYS = 30;

// Tells selected candidates about an opening, on WhatsApp, with the approved marketing template. It
// never names the client. A person presses the button; anyone who opted out, has no mobile number, or
// was already sent this template in the last 30 days is skipped. With `dryRun` it only reports how many
// would be sent and why others are skipped, so the cost is visible first.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const templateName = roleOpportunityTemplate();
  if (!templateName) {
    return NextResponse.json({ ok: false, error: "The WhatsApp opportunity template isn't set up yet. It needs the approved template name in settings (WHATSAPP_TEMPLATE_ROLE_OPPORTUNITY)." }, { status: 200 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { mandateId?: unknown; candidateIds?: unknown; dryRun?: unknown };
  const mandateId = typeof body.mandateId === "string" ? body.mandateId : "";
  const dryRun = body.dryRun === true;
  const all = (Array.isArray(body.candidateIds) ? body.candidateIds : []).filter((x): x is string => typeof x === "string");
  const ids = all.slice(0, MAX_PER_CALL);
  if (!mandateId || ids.length === 0) return NextResponse.json({ error: "Choose a role and at least one candidate." }, { status: 400 });

  const { data: mandate } = await supabase.from("mandates").select("role_title, city, cities").eq("id", mandateId).maybeSingle();
  if (!mandate) return NextResponse.json({ error: "That role could not be found." }, { status: 404 });
  const role = oneLine(String(mandate.role_title ?? "sales"));
  const cities = (mandate.cities as string[] | null) ?? [];
  const city = oneLine(cities[0] ?? (mandate.city as string | null) ?? "India");

  const { data: people } = await supabase.from("candidates").select("id, full_name, phone").in("id", ids);
  const since = new Date(new Date().getTime() - RECENT_DAYS * 86_400_000).toISOString();
  const { data: recent } = await admin
    .from("whatsapp_messages")
    .select("candidate_id")
    .eq("template_name", templateName)
    .eq("status", "sent")
    .gte("created_at", since)
    .in("candidate_id", ids);
  const recentlySent = new Set(((recent ?? []) as { candidate_id: string | null }[]).map((r) => r.candidate_id));

  const store = supabaseStore(admin);
  let noPhone = 0;
  let optedOut = 0;
  let already = 0;
  const eligible: { id: string; first: string; key: string }[] = [];

  for (const c of (people ?? []) as { id: string; full_name: string | null; phone: string | null }[]) {
    const key = phoneKey(c.phone);
    if (!key || key.length !== 10) {
      noPhone++;
      continue;
    }
    if (recentlySent.has(c.id)) {
      already++;
      continue;
    }
    const contact = await store.getContact(key);
    if (contact?.opted_out) {
      optedOut++;
      continue;
    }
    eligible.push({ id: c.id, first: oneLine((c.full_name ?? "").trim().split(/\s+/)[0] || "there"), key });
  }

  const over = Math.max(0, all.length - ids.length);
  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, willSend: eligible.length, noPhone, optedOut, alreadySent: already, over });

  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const c of eligible) {
    const res = await sendWhatsAppTemplate({ to: c.key, templateName, bodyParams: [c.first, role, city] });
    await store.logMessage({
      candidate_id: c.id,
      direction: "outbound",
      to_phone: c.key,
      body_preview: renderOpportunityMessage(c.first, role, city),
      status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
      template_name: templateName,
      meta_message_id: res.ok ? res.metaMessageId : null,
      error: res.ok ? null : res.error,
    });
    if (res.ok) {
      sent++;
      const contact = (await store.getContact(c.key)) ?? (await store.createContact(c.key));
      void contact;
      await store.updateContact(c.key, { kind: "jobseeker", kind_source: "manual", candidate_id: c.id });
    } else {
      failed++;
      firstError = firstError ?? res.error;
      if (res.status === "not_configured") break;
    }
  }

  if (sent > 0) {
    await admin.from("audit_log").insert({ actor: user.id, action: "role_opportunity_whatsapp", entity: "mandate", entity_id: mandateId, detail: { sent, failed, template: templateName } });
  }
  return NextResponse.json({ ok: true, sent, failed, noPhone, optedOut, alreadySent: already, over, error: firstError });
}
