import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildReactivationEmail } from "@/lib/campaign-emails";
import { emailRoom, sendBatch } from "@/lib/campaign-send";
import { sendWhatsAppBatch, WA_MAX_PER_PRESS } from "@/lib/campaign-whatsapp";
import { oneLine, reactivationTemplate } from "@/lib/whatsapp";
import { renderReactivationMessage } from "@/lib/whatsapp-template-text";

export const runtime = "nodejs";
export const maxDuration = 300;

type Row = { id: string; full_name: string | null; email?: string; phone?: string | null; current_job_title: string | null; current_employer: string | null; metro: string | null; seniority: string | null; pool_tier: string | null };

// "Re-engage your database": pick a kind of person (role type, optionally level and city), see who would be contacted and
// exactly what it says, untick anyone, then send. Nothing goes out until the person presses Send. WhatsApp uses the
// approved reactivation template; email goes from the team mailbox.
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

  const body = (await req.json().catch(() => ({}))) as { action?: string; channel?: string; cluster?: string; level?: string; metro?: string; ids?: unknown };
  const channel = body.channel === "email" ? "email" : "whatsapp";
  const cluster = typeof body.cluster === "string" ? body.cluster : "";
  if (!cluster) return NextResponse.json({ error: "Choose a role type." }, { status: 400 });
  const { data: cl } = await admin.from("role_clusters").select("name, track").eq("slug", cluster).maybeSingle();
  if (!cl) return NextResponse.json({ error: "Unknown role type." }, { status: 400 });
  // "SDR / BDR / ADR (outbound prospecting)" reads better as "SDR / BDR / ADR" inside a sentence.
  const role = oneLine(String(cl.name).replace(/\s*\(.*\)\s*$/, ""));

  // The approved WhatsApp message talks about "new sales roles", so it is only for people in sales. Email is wording-free.
  if (channel === "whatsapp" && cl.track === "non_sales") {
    return NextResponse.json({ ok: false, error: "The WhatsApp message is about sales roles, so it can't go to non-sales people. Use email for this group." });
  }
  const template = reactivationTemplate();
  if (channel === "whatsapp" && !template) return NextResponse.json({ ok: false, needsTemplate: true, error: "The WhatsApp template for this isn't set up yet." });
  if (channel === "email" && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)) return NextResponse.json({ error: "Email sending isn't configured." }, { status: 503 });

  // The segment is read as the signed-in person, so the same rules (staff only) apply.
  const { data: rows, error } = await supabase.rpc(channel === "whatsapp" ? "reactivation_segment_wa" : "reactivation_segment", { p_cluster: cluster, p_level: body.level || null, p_metro: body.metro || null, p_limit: 500 });
  if (error) return NextResponse.json({ error: "Couldn't look up that group." }, { status: 500 });
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
          return { id: c.id, first, phone: c.phone ?? null, bodyParams: [first], preview: renderReactivationMessage(first) };
        })
      );
    } else {
      result = await sendBatch(admin, user.id, "reactivation", chosen.map((c) => ({ id: c.id, full_name: c.full_name, email: c.email as string })), (c) => buildReactivationEmail(c, role), [cluster]);
    }
    await admin.from("audit_log").insert({ actor: user.id, action: `reactivation_${channel}`, entity: "segment", entity_id: null, detail: { cluster, level: body.level ?? null, metro: body.metro ?? null, sent: result.sent, failed: result.failed } });
    return NextResponse.json({ ok: true, ...result });
  }

  const people = all.slice(0, 60).map((r) => ({ id: r.id, name: r.full_name ?? "Unnamed", line: [r.current_job_title, r.current_employer].filter(Boolean).join(" at "), metro: r.metro, level: r.seniority, tier: r.pool_tier }));
  if (channel === "whatsapp") {
    return NextResponse.json({ ok: true, channel, total: all.length, perPress: WA_MAX_PER_PRESS, role, people, sample: { text: renderReactivationMessage(oneLine((all[0]?.full_name ?? "Priya").trim().split(/\s+/)[0] || "there")) } });
  }
  const { cap, room } = await emailRoom(admin);
  const sample = buildReactivationEmail({ id: "00000000-0000-0000-0000-000000000000", full_name: all[0]?.full_name ?? "Priya Sharma" }, role);
  return NextResponse.json({ ok: true, channel, total: all.length, cap, room, perPress: Math.min(30, room), role, people, sample: { subject: sample.subject, html: sample.html } });
}
