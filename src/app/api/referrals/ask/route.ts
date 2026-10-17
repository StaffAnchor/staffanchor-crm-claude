import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildReferralAskEmail } from "@/lib/campaign-emails";
import { emailRoom, sendBatch } from "@/lib/campaign-send";

export const runtime = "nodejs";
export const maxDuration = 300;

// "Ask for referrals": lists the people worth asking (placed and settled in, interviewed with a client, rated top or
// strong), and sends the ask to the ones a person picks. The person asked is never asked again for 90 days.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return NextResponse.json({ error: "Email sending isn't configured." }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown };
  const { data: rows, error } = await supabase.rpc("referral_ask_candidates", { p_limit: 150 });
  if (error) return NextResponse.json({ error: "Couldn't look up who to ask." }, { status: 500 });
  const all = (rows ?? []) as { id: string; full_name: string | null; email: string; reason: string; priority: number }[];

  if (body.action === "send") {
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string"));
    const chosen = all.filter((r) => ids.has(r.id));
    if (chosen.length === 0) return NextResponse.json({ error: "Choose at least one person." }, { status: 400 });
    const result = await sendBatch(admin, user.id, "referral_ask", chosen, (c) => buildReferralAskEmail(c));
    await admin.from("audit_log").insert({ actor: user.id, action: "referral_ask_email", entity: "candidates", entity_id: null, detail: { sent: result.sent, failed: result.failed } });
    return NextResponse.json({ ok: true, ...result });
  }

  const { cap, room } = await emailRoom(admin);
  const sample = buildReferralAskEmail({ id: "00000000-0000-0000-0000-000000000000", full_name: all[0]?.full_name ?? "Priya Sharma" });
  return NextResponse.json({ ok: true, cap, room, people: all.map((r) => ({ id: r.id, name: r.full_name ?? "Unnamed", reason: r.reason })), sample: { subject: sample.subject, html: sample.html } });
}
