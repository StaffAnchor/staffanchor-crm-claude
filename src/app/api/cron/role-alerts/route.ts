import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendWhatsAppTemplate, roleOpportunityTemplate, roleNudgeTemplate, oneLine } from "@/lib/whatsapp";
import { supabaseStore } from "@/lib/whatsapp-bot/store";
import { phoneKey } from "@/lib/whatsapp-threads";
import { renderOpportunityMessage } from "@/lib/whatsapp-template-text";
import type { RoleCard } from "@/lib/role-card";
import { clustersFor, rankCandidates, type MatchRow } from "@/lib/role-match";
import { applyRoleInterest, interestForRole } from "@/lib/role-interest";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Automatic "a role that fits you" alert on WhatsApp, for the people who tapped "Activate on WhatsApp" on the jobs site
// (whatsapp_opt_in_source = 'activation_message'). They were told they would get matching roles, so this keeps that promise.
//
// Deliberately careful, because it messages real people and Meta charges per message:
//   - OFF unless ROLE_ALERTS_ENABLED=1. With ?dry=1 it only reports who would get what, and never sends.
//   - Only people who explicitly activated. People who merely chatted with the assistant are not included.
//   - At most one alert per person every 7 days (counting manual role messages), and at most ROLE_ALERTS_DAILY_MAX a day.
//   - Only live vacancies that are open (never pipeline roles, which are not a specific opening), and only a Perfect match by
//     the same role-match rules the Matches tab uses (city, experience, level, sales type; set ROLE_ALERTS_BUCKETS=perfect,close to widen).
//     Never a role the person is already in, was already told about, was dismissed for, or said no to on a call.
//   - Uses the approved role-opportunity template, which never names the client. A Yes reply lands in the role's pipeline.
//   - Skips people who opted out, paused, have no valid mobile number or are on phone hold.
export const maxDuration = 60;

const MIN_DAYS_BETWEEN = 7;
const CANDIDATE_LIMIT = 500;

type Cand = { id: string; full_name: string | null; phone: string | null; phone_hold: boolean | null };

async function handler(req: NextRequest) {
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      // A signed-in admin may open the preview (?dry=1) in the browser. It never sends anything.
      let admin = false;
      if (dry) {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
          admin = me?.role === "admin";
        }
      }
      if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
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
    .select("id, full_name, phone, phone_hold")
    .eq("whatsapp_opt_in", true)
    .eq("whatsapp_opt_in_source", "activation_message")
    .limit(CANDIDATE_LIMIT);
  const cands = (candRows ?? []) as Cand[];
  if (cands.length === 0) return NextResponse.json({ ok: true, dry, candidates: 0, note: "No candidates have tapped Activate on WhatsApp yet." });
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

  // Rank each open live role's pool with the Matches-tab rules, and keep the activated people who come out Perfect.
  const buckets = new Set((process.env.ROLE_ALERTS_BUCKETS ?? "perfect").split(",").map((x) => x.trim()).filter(Boolean));
  const idSet = new Set(ids);
  const picks = new Map<string, { mandateId: string; score: number; role: string; city: string }[]>();
  const { data: roleRows } = await admin.from("mandates").select("id, role_title, city, cities, role_cluster, also_clusters").eq("status", "open").eq("listing_kind", "live").not("role_cluster", "is", null);
  const [{ data: edgeRows }, { data: worldRows }] = await Promise.all([admin.from("selling_world_edges").select("a, b, weight"), admin.from("selling_worlds").select("slug, name")]);
  const edges = new Map<string, Map<string, number>>();
  for (const e of (edgeRows ?? []) as { a: string; b: string; weight: number }[]) {
    (edges.get(e.a) ?? edges.set(e.a, new Map()).get(e.a)!).set(e.b, Number(e.weight));
    (edges.get(e.b) ?? edges.set(e.b, new Map()).get(e.b)!).set(e.a, Number(e.weight));
  }
  const nameOf = new Map(((worldRows ?? []) as { slug: string; name: string }[]).map((w) => [w.slug, w.name]));
  await Promise.all(
    ((roleRows ?? []) as { id: string; role_title: string | null; city: string | null; cities: string[] | null; role_cluster: string | null; also_clusters: string[] | null }[]).map(async (m) => {
      if (!m.role_title) return;
      const { data: cardRow } = await admin.from("mandate_role_cards").select("card").eq("mandate_id", m.id).maybeSingle();
      if (!cardRow) return;
      const card = cardRow.card as RoleCard;
      const also = (m.also_clusters ?? []).filter((x) => x !== m.role_cluster);
      const want = new Set<string>([...card.exact_worlds, ...card.adjacent_worlds.map((a) => a.slug)]);
      for (const ex of card.exact_worlds) for (const [w, v] of edges.get(ex) ?? []) if (v >= 0.5) want.add(w);
      const [{ data: pool }, { data: dismissed }, roleInterest] = await Promise.all([
        admin.rpc("role_match_candidates", { p_clusters: clustersFor(card, also), p_worlds: Array.from(want), p_limit: 900 }),
        admin.from("match_dismissals").select("candidate_id").eq("mandate_id", m.id),
        interestForRole(admin, m.id),
      ]);
      const skipIds = new Set(((dismissed ?? []) as { candidate_id: string }[]).map((d) => d.candidate_id));
      const rows = ((pool ?? []) as MatchRow[]).filter((r) => idSet.has(r.candidate_id) && !skipIds.has(r.candidate_id));
      const ranked = applyRoleInterest(rankCandidates(card, rows, edges, (x) => nameOf.get(x) ?? x, { also }), roleInterest);
      for (const r of ranked) {
        if (!buckets.has(r.bucket)) continue;
        const list = picks.get(r.row.candidate_id) ?? [];
        list.push({ mandateId: m.id, score: r.score, role: oneLine(m.role_title ?? ""), city: oneLine(m.cities?.[0] ?? m.city ?? "India") });
        picks.set(r.row.candidate_id, list);
      }
    })
  );

  const report: { candidate_id: string; action: string; role?: string; score?: number }[] = [];
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
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
    const options = (picks.get(c.id) ?? []).filter((o) => !seen.get(c.id)?.has(o.mandateId)).sort((x, y) => y.score - x.score);
    const pick = options[0] ? { id: options[0].mandateId, score: options[0].score, role: options[0].role, city: options[0].city } : null;
    if (!pick) {
      skip("no Perfect match among live roles");
      continue;
    }
    const first = oneLine((c.full_name ?? "").trim().split(/\s+/)[0] || "there");
    if (dry) {
      report.push({ candidate_id: c.id, action: "would send", role: `${pick.role} in ${pick.city}`, score: pick.score });
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
      await admin.from("audit_log").insert({ actor: null, action: "role_alert_auto", entity: "candidate", entity_id: c.id, detail: { mandate_id: pick.id, score: pick.score, template: templateName } });
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
