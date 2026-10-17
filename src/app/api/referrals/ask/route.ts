import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildReferralAskEmail } from "@/lib/campaign-emails";
import { emailRoom, sendBatch } from "@/lib/campaign-send";
import { sendWhatsAppBatch, WA_MAX_PER_PRESS } from "@/lib/campaign-whatsapp";
import { oneLine, referralAskTemplate } from "@/lib/whatsapp";
import { renderReferralAskMessage } from "@/lib/whatsapp-template-text";
import { signedToken } from "@/lib/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

type Row = { id: string; full_name: string | null; email?: string; phone?: string | null; reason: string; priority: number };

// "Ask for referrals": lists the people worth asking (placed and settled in, interviewed with a client, rated top or
// strong), and sends the ask to the ones a person picks, on WhatsApp (approved template with a "Refer someone" link) or
// by email. The person asked is never asked again for 90 days.
export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as { action?: string; channel?: string; ids?: unknown };
  const channel = body.channel === "email" ? "email" : "whatsapp";
  const template = referralAskTemplate();
  if (channel === "whatsapp" && !template) return NextResponse.json({ ok: false, needsTemplate: true, error: "The WhatsApp template for this isn't set up yet." });
  if (channel === "email" && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)) return NextResponse.json({ error: "Email sending isn't configured." }, { status: 503 });

  const { data: rows, error } =
    channel === "whatsapp" ? await supabase.rpc("referral_ask_candidates_wa", { p_template: template, p_limit: 150 }) : await supabase.rpc("referral_ask_candidates", { p_limit: 150 });
  if (error) return NextResponse.json({ error: "Couldn't look up who to ask." }, { status: 500 });
  const all = (rows ?? []) as Row[];

  if (body.action === "send") {
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string"));
    const chosen = all.filter((r) => ids.has(r.id));
    if (chosen.length === 0) return NextResponse.json({ error: "Choose at least one person." }, { status: 400 });
    let result: Record<string, unknown>;
    if (channel === "whatsapp") {
      result = await sendWhatsAppBatch(
        admin,
        template!,
        chosen.map((c) => {
          const first = oneLine((c.full_name ?? "").trim().split(/\s+/)[0] || "there");
          // The link button adds this after ".../refer/": the person's id and their signed token.
          return { id: c.id, first, phone: c.phone ?? null, bodyParams: [first], urlButtonParam: `${c.id}?t=${signedToken(c.id, "refer")}`, preview: renderReferralAskMessage(first) };
        })
      );
    } else {
      result = await sendBatch(admin, user.id, "referral_ask", chosen.map((c) => ({ id: c.id, full_name: c.full_name, email: c.email as string })), (c) => buildReferralAskEmail(c));
    }
    await admin.from("audit_log").insert({ actor: user.id, action: `referral_ask_${channel}`, entity: "candidates", entity_id: null, detail: { sent: result.sent, failed: result.failed } });
    return NextResponse.json({ ok: true, ...result });
  }

  const people = all.map((r) => ({ id: r.id, name: r.full_name ?? "Unnamed", reason: r.reason }));
  if (channel === "whatsapp") {
    return NextResponse.json({ ok: true, channel, perPress: WA_MAX_PER_PRESS, people, sample: { text: renderReferralAskMessage(oneLine((all[0]?.full_name ?? "Priya").trim().split(/\s+/)[0] || "there")) } });
  }
  const { cap, room } = await emailRoom(admin);
  const sample = buildReferralAskEmail({ id: "00000000-0000-0000-0000-000000000000", full_name: all[0]?.full_name ?? "Priya Sharma" });
  return NextResponse.json({ ok: true, channel, cap, room, perPress: Math.min(30, room), people, sample: { subject: sample.subject, html: sample.html } });
}
