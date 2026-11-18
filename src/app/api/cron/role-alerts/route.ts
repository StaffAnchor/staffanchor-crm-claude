import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate, roleOpportunityTemplate, roleNudgeTemplate, oneLine } from "@/lib/whatsapp";
import { supabaseStore } from "@/lib/whatsapp-bot/store";
import { phoneKey } from "@/lib/whatsapp-threads";
import { renderOpportunityMessage } from "@/lib/whatsapp-template-text";
import { PROACTIVE_MATCH_SIMILARITY_THRESHOLD } from "@/lib/proactive-match";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Automatic "a role that fits you" alert on WhatsApp, for the people who tapped "Activate on WhatsApp" on the jobs site
// (whatsapp_opt_in_source = 'activation_message'). They were told they would get matching roles, so this keeps that promise.
//
// Deliberately careful, because it messages real people and Meta charges per message:
//   - OFF unless ROLE_ALERTS_ENABLED=1. With ?dry=1 it only reports who would get what, and never sends.
//   - Only people who explicitly activated. People who merely chatted with the assistant are not included.
//   - At most one alert per person every 7 days (counting manual role messages), and at most ROLE_ALERTS_DAILY_MAX a day.
//   - Only live vacancies that are open (never pipeline roles, which are not a specific opening), only a strong match
//     (same similarity bar the proactive matcher uses), never a role the person is already in or was already told about.
//   - Uses the approved role-opportunity template, which never names the client. A Yes reply lands in the role's pipeline.
//   - Skips people who opted out, paused, have no valid mobile number or are on phone hold.
export const maxDuration = 60;

const MIN_DAYS_BETWEEN = 7;
const CANDIDATE_LIMIT = 500;

type Cand = { id: string; full_name: string | null; phone: string | null; phone_hold: boolean | null; profile_embedding: unknown };

function toVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? (x as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const enabled = process.env.ROLE_ALERTS_ENABLED === "1";
  if (!enabled && !dry) return NextResponse.json({ ok: true, note: "Role alerts are switched off (set ROLE_ALERTS_ENABLED=1 to turn them on). Add ?dry=1 to preview." });

  const templateName = roleOpportunityTemplate();
  if (!templateName) return NextResponse.json({ ok: true, note: "The opportunity template is not set up (WHATSAPP_TEMPLATE_ROLE_OPPORTUNITY)." });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const store = supabaseStore(admin);

  const dailyMax = Math.max(1, Number(process.env.ROLE_ALERTS_DAILY_MAX ?? 30) || 30);
  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count: sentToday } = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "role_alert_auto").gte("created_at", dayAgo);
  let room = Math.max(0, dailyMax - (sentToday ?? 0));

  const { data: candRows } = await admin
    .from("candidates")
    .select("id, full_name, phone, phone_hold, profile_embedding")
    .eq("whatsapp_opt_in", true)
    .eq("whatsapp_opt_in_source", "activation_message")
    .not("profile_embedding", "is", null)
    .limit(CANDIDATE_LIMIT);
  const cands = (candRows ?? []) as Cand[];
  if (cands.length === 0) return NextResponse.json({ ok: true, dry, candidates: 0, note: "No activated candidates with a profile yet." });
  const ids = cands.map((c) => c.id);

  // Who was messaged about a role in the last 7 days (this template, the reminder, or an earlier auto alert).
  const since = new Date(Date.now() - MIN_DAYS_BETWEEN * 86_400_000).toISOString();
  const names = [templateName, roleNudgeTemplate()].filter((x): x is string => !!x);
  const { data: recent } = await admin.from("whatsapp_messages").select("candidate_id").in("template_name", names).eq("direction", "outbound").eq("status", "sent").gte("created_at", since).in("candidate_id", ids);
  const recentlyAlerted = new Set(((recent ?? []) as { candidate_id: string | null }[]).map((r) => r.candidate_id));

  // Roles each person is already linked to or was already told about.
  const { data: links } = await admin.from("candidate_mandate_links").select("candidate_id, mandate_id").in("candidate_id", ids);
  const { data: outs } = await admin.from("mandate_outreach").select("candidate_id, mandate_id").in("candidate_id", ids);
  const seen = new Map<string, Set<string>>();
  for (const r of [...(links ?? []), ...(outs ?? [])] as { candidate_id: string; mandate_id: string }[]) {
    if (!seen.has(r.candidate_id)) seen.set(r.candidate_id, new Set());
    seen.get(r.candidate_id)!.add(r.mandate_id);
  }

  const report: { candidate_id: string; action: string; role?: string; similarity?: number }[] = [];
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const mandateCache = new Map<string, { role_title: string | null; city: string | null; cities: string[] | null; status: string; listing_kind: string | null } | null>();
  let sent = 0;
  let failed = 0;

  for (const c of cands) {
    if (room <= 0 && !dry) {
      skip("daily limit reached");
      continue;
    }
    const key = phoneKey(c.phone);
    if (c.phone_hold || !key || key.length !== 10) {
      skip("no valid mobile number");
      continue;
    }
    if (recentlyAlerted.has(c.id)) {
      skip("messaged about a role in the last 7 days");
      continue;
    }
    const contact = await store.getContact(key);
    if (contact?.opted_out || contact?.bot_paused) {
      skip("opted out or paused");
      continue;
    }
    const vec = toVector(c.profile_embedding);
    if (!vec) {
      skip("no profile vector");
      continue;
    }
    const { data: hits } = await admin.rpc("match_mandates_for_candidate", { query_embedding: vec, match_count: 10 });
    const strong = ((hits ?? []) as { id: string; similarity: number }[]).filter((m) => m.similarity >= PROACTIVE_MATCH_SIMILARITY_THRESHOLD && !seen.get(c.id)?.has(m.id));
    let pick: { id: string; similarity: number; role: string; city: string } | null = null;
    for (const h of strong) {
      if (!mandateCache.has(h.id)) {
        const { data: m } = await admin.from("mandates").select("role_title, city, cities, status, listing_kind").eq("id", h.id).maybeSingle();
        mandateCache.set(h.id, (m as { role_title: string | null; city: string | null; cities: string[] | null; status: string; listing_kind: string | null } | null) ?? null);
      }
      const m = mandateCache.get(h.id);
      if (!m || m.status !== "open" || m.listing_kind === "pipeline" || !m.role_title) continue;
      pick = { id: h.id, similarity: h.similarity, role: oneLine(m.role_title), city: oneLine(m.cities?.[0] ?? m.city ?? "India") };
      break;
    }
    if (!pick) {
      skip("no strong new match");
      continue;
    }
    const first = oneLine((c.full_name ?? "").trim().split(/\s+/)[0] || "there");
    if (dry) {
      report.push({ candidate_id: c.id, action: "would send", role: `${pick.role} in ${pick.city}`, similarity: Math.round(pick.similarity * 100) / 100 });
      continue;
    }

    const res = await sendWhatsAppTemplate({ to: key, templateName, bodyParams: [first, pick.role, pick.city] });
    await store.logMessage({
      candidate_id: c.id,
      direction: "outbound",
      to_phone: key,
      body_preview: renderOpportunityMessage(first, pick.role, pick.city),
      status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
      template_name: templateName,
      meta_message_id: res.ok ? res.metaMessageId : null,
      error: res.ok ? null : res.error,
    });
    if (res.ok) {
      sent++;
      room--;
      await admin.from("mandate_outreach").upsert({ mandate_id: pick.id, candidate_id: c.id, channel: "whatsapp", status: "sent", sent_by: null, sent_at: new Date().toISOString(), replied_at: null }, { onConflict: "mandate_id,candidate_id" });
      await store.updateContact(key, { kind: "jobseeker", kind_source: "manual", candidate_id: c.id });
      await admin.from("audit_log").insert({ actor: null, action: "role_alert_auto", entity: "candidate", entity_id: c.id, detail: { mandate_id: pick.id, similarity: pick.similarity, template: templateName } });
      report.push({ candidate_id: c.id, action: "sent", role: `${pick.role} in ${pick.city}` });
    } else {
      failed++;
      report.push({ candidate_id: c.id, action: `failed: ${res.error}` });
      if (res.status === "not_configured") break;
    }
  }

  return NextResponse.json({ ok: true, dry, candidates: cands.length, sent, failed, skipped, report });
}

export const GET = withHeartbeat("role-alerts", 1440, handler);
