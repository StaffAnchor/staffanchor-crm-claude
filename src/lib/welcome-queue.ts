import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/mail";
import { buildWelcomeEmail, sendGapMs } from "@/lib/outreach";

const MAX_ATTEMPTS = 3;

/**
 * Sends up to `limit` queued "confirm your profile" emails (profiles created by bulk upload), oldest
 * first, with a pause between messages. Used by the daily job and by the Send button on the Outreach
 * page, so both draw from the same queue and the same daily limit.
 */
export async function sendQueuedWelcomes(admin: SupabaseClient, limit: number): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  if (limit <= 0) return out;
  const { data: queued } = await admin
    .from("welcome_queue")
    .select("candidate_id, email, full_name, missing, attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  const { data: staffRows } = await admin.from("profiles").select("email");
  const staffEmails = new Set(((staffRows ?? []) as { email: string | null }[]).map((r) => (r.email ?? "").toLowerCase()).filter(Boolean));

  for (const q of queued ?? []) {
    if (staffEmails.has((q.email ?? "").toLowerCase())) {
      await admin.from("welcome_queue").update({ status: "skipped", error: "staff address" }).eq("candidate_id", q.candidate_id);
      out.skipped++;
      continue;
    }
    const { data: cand } = await admin
      .from("candidates")
      .select("id, email_opt_out, profile_nudge_unsubscribed, profile_nudge_last_sent_at")
      .eq("id", q.candidate_id)
      .maybeSingle();
    const sevenDaysAgo = new Date(new Date().getTime() - 7 * 86_400_000).toISOString();
    const { data: asked } = await admin.from("profile_outreach").select("id").eq("candidate_id", q.candidate_id).in("status", ["sent", "failed"]).gt("created_at", sevenDaysAgo).limit(1);
    const nudgedRecently = !!cand?.profile_nudge_last_sent_at && cand.profile_nudge_last_sent_at > sevenDaysAgo;
    if (!cand || cand.email_opt_out || cand.profile_nudge_unsubscribed || nudgedRecently || (asked && asked.length > 0)) {
      await admin
        .from("welcome_queue")
        .update({ status: "skipped", error: !cand || cand.email_opt_out || cand.profile_nudge_unsubscribed ? "opted out" : "already asked in the last 7 days" })
        .eq("candidate_id", q.candidate_id);
      out.skipped++;
      continue;
    }
    try {
      const redirectTo = `${process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com"}/candidate-portal`;
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: q.email, options: { redirectTo } });
      if (linkErr || !link?.properties?.action_link) throw new Error(linkErr?.message ?? "Could not create a login link");
      const mail = buildWelcomeEmail({ id: q.candidate_id, full_name: q.full_name }, q.missing ?? [], link.properties.action_link);
      await sendEmail({
        to: q.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        plain: true,
        headers: { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      await admin.from("welcome_queue").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("candidate_id", q.candidate_id);
      out.sent++;
    } catch (err) {
      const attempts = (q.attempts ?? 0) + 1;
      await admin
        .from("welcome_queue")
        .update({ status: attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, error: err instanceof Error ? err.message.slice(0, 300) : "send failed" })
        .eq("candidate_id", q.candidate_id);
      out.failed++;
    }
    await new Promise((r) => setTimeout(r, sendGapMs));
  }
  return out;
}
