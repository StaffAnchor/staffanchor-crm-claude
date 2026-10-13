import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/mail";
import { buildSalesDetailsEmail, dailyCap, MAX_PER_CLICK, sendGapMs, SALES_ASK_KEYS } from "@/lib/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

// The passport gap label (as the saas_passport view writes it) to the ask key.
const KEY_OF: Record<string, string> = {
  segment: "customer_segments",
  "deal size": "deal_size",
  "quota / attainment": "quota",
  "sales cycle": "sales_cycle",
  "hunter or farmer": "hunter_farmer",
};

// Emails the selected B2B sales candidates asking for the sales details their profile lacks. A person
// presses the button; it shares the daily limit with every other outreach email, skips anyone opted
// out, staff, recently contacted or without a usable address, and pauses between messages.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return NextResponse.json({ error: "Email sending isn't configured." }, { status: 503 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { candidateIds?: unknown };
  const ids = (Array.isArray(body.candidateIds) ? body.candidateIds : []).filter((x): x is string => typeof x === "string").slice(0, MAX_PER_CLICK);
  if (ids.length === 0) return NextResponse.json({ error: "Choose at least one candidate." }, { status: 400 });

  const { data: stats } = await admin.rpc("outreach_stats");
  const s = (stats ?? {}) as { sent_24h?: number; first_sent_at?: string | null };
  const cap = dailyCap(s.first_sent_at ?? null, new Date().getTime());
  const room = Math.max(0, cap - (s.sent_24h ?? 0));
  if (room <= 0) return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: ids.length, note: `Today's limit of ${cap} is used up. It resets on a rolling 24 hours.` });

  const { data: eligible } = await admin.rpc("outreach_eligible_ids", { p_ids: ids });
  const people = (eligible ?? []) as { id: string; full_name: string | null; email: string }[];

  const { data: passports } = await admin.from("saas_passport").select("candidate_id, passport_missing").in("candidate_id", people.map((p) => p.id));
  const gaps = new Map(((passports ?? []) as { candidate_id: string; passport_missing: string[] | null }[]).map((p) => [p.candidate_id, p.passport_missing ?? []]));

  let sent = 0;
  let failed = 0;
  let noGaps = 0;
  let consecutiveFails = 0;
  let overCap = 0;
  for (const c of people) {
    const asks = (gaps.get(c.id) ?? []).map((g) => KEY_OF[g]).filter((k): k is string => !!k && SALES_ASK_KEYS.includes(k));
    if (asks.length === 0) {
      noGaps++;
      continue;
    }
    if (sent + failed >= room) {
      overCap++;
      continue;
    }
    if (consecutiveFails >= 3) break; // something is wrong with the mailbox; stop instead of burning through people
    const mail = buildSalesDetailsEmail(c, asks);
    try {
      await sendEmail({
        to: c.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        plain: true,
        headers: { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      await admin.from("profile_outreach").insert({ candidate_id: c.id, kind: "sales_details", channel: "email", status: "sent", asked: asks, to_email: c.email, sent_by: user.id });
      sent++;
      consecutiveFails = 0;
    } catch (err) {
      await admin.from("profile_outreach").insert({
        candidate_id: c.id,
        kind: "sales_details",
        channel: "email",
        status: "failed",
        asked: asks,
        to_email: c.email,
        error: err instanceof Error ? err.message.slice(0, 300) : "send failed",
        sent_by: user.id,
      });
      failed++;
      consecutiveFails++;
    }
    await new Promise((r) => setTimeout(r, sendGapMs));
  }

  const notEligible = ids.length - people.length;
  return NextResponse.json({ ok: true, sent, failed, skipped: notEligible + noGaps + overCap, notEligible, noGaps, overCap, stoppedEarly: consecutiveFails >= 3 });
}
