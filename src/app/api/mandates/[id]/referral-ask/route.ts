import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildRoleReferralAskEmail } from "@/lib/campaign-emails";
import { emailRoom, sendBatch } from "@/lib/campaign-send";
import { sendWhatsAppBatch, WA_MAX_PER_PRESS } from "@/lib/campaign-whatsapp";
import { oneLine, referralRoleTemplate } from "@/lib/whatsapp";
import { renderReferralRoleMessage } from "@/lib/whatsapp-template-text";
import { signedToken } from "@/lib/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

type Row = { id: string; full_name: string | null; email: string | null; phone: string | null; reason: string; score: number };

// Ask people who are likely to know a fit for ONE open role: "We're hiring a <role> in <city>. Know someone?". The
// link opens that role and saves the referral against it. Only live mandates, never pipeline roles. A person reviews
// the message and picks who to ask; nobody is asked twice about the same role.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const { id } = await ctx.params;

  const { data: mandate } = await supabase.from("mandates").select("role_title, city, cities, short_code, status, is_archived, listing_kind").eq("id", id).maybeSingle();
  if (!mandate) return NextResponse.json({ error: "That role could not be found." }, { status: 404 });
  if (mandate.status !== "open" || mandate.is_archived || mandate.listing_kind === "pipeline" || !mandate.short_code) {
    return NextResponse.json({ error: "Referral asks are only for live, open roles with a public link." }, { status: 400 });
  }
  const title = oneLine(String(mandate.role_title ?? "sales"));
  const city = oneLine(((mandate.cities as string[] | null) ?? [])[0] ?? (mandate.city as string | null) ?? "India");
  const code = String(mandate.short_code).toLowerCase();

  const body = (await req.json().catch(() => ({}))) as { action?: string; channel?: string; ids?: unknown };
  const channel = body.channel === "email" ? "email" : "whatsapp";
  const template = referralRoleTemplate();
  if (channel === "whatsapp" && !template) return NextResponse.json({ ok: false, needsTemplate: true, error: "The WhatsApp template for this isn't set up yet." });
  if (channel === "email" && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)) return NextResponse.json({ error: "Email sending isn't configured." }, { status: 503 });

  const { data: rows, error } = await supabase.rpc("referral_ask_for_mandate", { p_mandate_id: id, p_channel: channel, p_limit: 100 });
  if (error) return NextResponse.json({ error: "Couldn't look up who to ask." }, { status: 500 });
  const all = (rows ?? []) as Row[];

  if (body.action === "send") {
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string"));
    const chosen = all.filter((r) => ids.has(r.id));
    if (chosen.length === 0) return NextResponse.json({ error: "Choose at least one person." }, { status: 400 });
    let result: Record<string, unknown> & { sent?: number };
    let sentIds: string[] = [];
    if (channel === "whatsapp") {
      const first = (c: Row) => oneLine((c.full_name ?? "").trim().split(/\s+/)[0] || "there");
      result = await sendWhatsAppBatch(
        admin,
        template!,
        chosen.map((c) => ({
          id: c.id,
          first: first(c),
          phone: c.phone,
          bodyParams: [first(c), title, city],
          // The link button adds this after ".../refer/": the person's id, their signed token, and this role's code.
          urlButtonParam: `${c.id}?t=${signedToken(c.id, "refer")}&m=${code}`,
          preview: renderReferralRoleMessage(first(c), title, city),
        }))
      );
      // The first N of the chosen list were attempted; record each ask that went out so nobody is asked twice.
      sentIds = chosen.slice(0, WA_MAX_PER_PRESS).map((c) => c.id);
    } else {
      result = await sendBatch(admin, user.id, "referral_ask", chosen.map((c) => ({ id: c.id, full_name: c.full_name, email: c.email as string })), (c) => buildRoleReferralAskEmail(c, { title, city, code }));
      sentIds = chosen.slice(0, 30).map((c) => c.id);
    }
    if ((result.sent ?? 0) > 0) {
      // Recorded from the log of what actually went out, not from who was attempted.
      const { data: out } =
        channel === "whatsapp"
          ? await admin.from("whatsapp_messages").select("candidate_id").eq("template_name", template!).eq("status", "sent").in("candidate_id", sentIds).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
          : await admin.from("profile_outreach").select("candidate_id").eq("kind", "referral_ask").eq("status", "sent").in("candidate_id", sentIds).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
      const done = Array.from(new Set(((out ?? []) as { candidate_id: string }[]).map((o) => o.candidate_id)));
      if (done.length) await admin.from("referral_asks").upsert(done.map((cid) => ({ mandate_id: id, candidate_id: cid, channel, sent_by: user.id })), { onConflict: "mandate_id,candidate_id", ignoreDuplicates: true });
    }
    await admin.from("audit_log").insert({ actor: user.id, action: `referral_role_ask_${channel}`, entity: "mandate", entity_id: id, detail: { sent: result.sent, failed: result.failed } });
    return NextResponse.json({ ok: true, ...result });
  }

  const people = all.map((r) => ({ id: r.id, name: r.full_name ?? "Unnamed", reason: r.reason }));
  const first = oneLine((all[0]?.full_name ?? "Priya").trim().split(/\s+/)[0] || "there");
  if (channel === "whatsapp") return NextResponse.json({ ok: true, channel, perPress: WA_MAX_PER_PRESS, people, sample: { text: renderReferralRoleMessage(first, title, city) } });
  const { cap, room } = await emailRoom(admin);
  const sample = buildRoleReferralAskEmail({ id: "00000000-0000-0000-0000-000000000000", full_name: all[0]?.full_name ?? "Priya Sharma" }, { title, city, code });
  return NextResponse.json({ ok: true, channel, cap, room, perPress: Math.min(30, room), people, sample: { subject: sample.subject, html: sample.html } });
}
