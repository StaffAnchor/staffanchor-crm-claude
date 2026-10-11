import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/mail";
import { buildOutreachEmail, dailyCap, MAX_PER_CLICK, sendGapMs } from "@/lib/outreach";
import { sendQueuedWelcomes } from "@/lib/welcome-queue";

export const runtime = "nodejs";
export const maxDuration = 300;

type Next = { id: string; full_name: string | null; email: string; asks: string[] };

// Sends the next small batch of "complete your profile" emails. Always a person pressing the button,
// never more than the daily cap, with a pause between messages.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return NextResponse.json({ error: "Email sending isn't configured." }, { status: 503 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const body = (await req.json().catch(() => ({}))) as { count?: number };
  const nowMs = new Date().getTime();
  const { data: stats } = await admin.rpc("outreach_stats");
  const s = (stats ?? {}) as { sent_24h?: number; first_sent_at?: string | null };
  const cap = dailyCap(s.first_sent_at ?? null, nowMs);
  const room = Math.max(0, cap - (s.sent_24h ?? 0));
  const want = Math.min(Math.max(1, Math.floor(body.count ?? MAX_PER_CLICK)), MAX_PER_CLICK, room);
  if (want <= 0) return NextResponse.json({ ok: true, sent: 0, failed: 0, note: `Today's limit of ${cap} is used up. Try again later; it resets on a rolling 24 hours.` });

  // Bulk-upload welcome emails waiting in the queue go first; the rest of the batch is outreach.
  const welcomes = await sendQueuedWelcomes(admin, want);
  const left = want - welcomes.sent - welcomes.failed;
  if (left <= 0) return NextResponse.json({ ok: true, sent: welcomes.sent, failed: welcomes.failed, welcomes: welcomes.sent });

  const { data: next, error } = await admin.rpc("outreach_next", { p_limit: left });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const batch = (next ?? []) as Next[];

  let sent = 0;
  let failed = 0;
  let consecutiveFails = 0;
  for (const c of batch) {
    if (consecutiveFails >= 3) break; // something is wrong with the mailbox; stop instead of burning through people
    const mail = buildOutreachEmail(c, c.asks);
    try {
      await sendEmail({
        to: c.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        plain: true,
        headers: { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      await admin.from("profile_outreach").insert({ candidate_id: c.id, status: "sent", asked: c.asks, to_email: c.email, sent_by: user.id });
      sent++;
      consecutiveFails = 0;
    } catch (err) {
      await admin.from("profile_outreach").insert({
        candidate_id: c.id,
        status: "failed",
        asked: c.asks,
        to_email: c.email,
        error: err instanceof Error ? err.message.slice(0, 300) : "send failed",
        sent_by: user.id,
      });
      failed++;
      consecutiveFails++;
    }
    await new Promise((r) => setTimeout(r, sendGapMs));
  }
  return NextResponse.json({ ok: true, sent: sent + welcomes.sent, failed: failed + welcomes.failed, welcomes: welcomes.sent, stoppedEarly: consecutiveFails >= 3 });
}
