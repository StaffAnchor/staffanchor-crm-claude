import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { missingKeyDetails, type KeyDetailCandidate } from "@/lib/key-details";
import { newTextOf, readReplyFields } from "@/lib/read-reply-fields";

// Reads the info@ inbox for replies to our "complete your profile" emails and fills the blanks they answer.
// Never deletes or flags anything in the mailbox, and never overwrites a value that is already on a profile.

export type ReplySummary = {
  ok: boolean;
  error?: string;
  read: number;
  applied: number;
  unclear: number;
  noCandidate: number;
  ignored: number;
  bounced: number;
  softBounced: number;
  optedOut: number;
};

const EMPTY: ReplySummary = { ok: true, read: 0, applied: 0, unclear: 0, noCandidate: 0, ignored: 0, bounced: 0, softBounced: 0, optedOut: 0 };
const FIELD_COLUMNS = "id, email, current_job_title, current_employer, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, resume_file_url";
const SAFE_FIELDS = ["current_fixed_ctc", "expected_fixed_ctc", "notice_period", "total_experience_years", "current_location", "current_employer", "current_job_title"];

const friendlyError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/auth|credentials|invalid|login/i.test(msg)) return "The mailbox login was refused. Check that the app password for info@ is still valid.";
  if (/imap/i.test(msg) && /(disabled|not enabled|access)/i.test(msg)) return "IMAP is switched off for this mailbox. Turn it on in Gmail settings (Forwarding and POP/IMAP).";
  return `Couldn't read the mailbox: ${msg.slice(0, 160)}`;
};

export async function checkEmailReplies(admin: SupabaseClient, opts: { sinceDays?: number; max?: number } = {}): Promise<ReplySummary> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ...EMPTY, ok: false, error: "Email isn't configured." };
  const out = { ...EMPTY };
  const sinceDays = opts.sinceDays ?? 7;
  const max = opts.max ?? 80;
  const since = new Date(new Date().getTime() - sinceDays * 86_400_000);

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const found = (await client.search({ since })) || [];
      const uids = found.slice(-max);
      const known = new Set<string>();
      // Messages already handled on an earlier run are skipped (matched by their Message-ID).
      const seenRows: { message_id: string }[] = [];
      const { data: seen } = await admin.from("email_replies").select("message_id").gte("created_at", new Date(since.getTime() - 86_400_000).toISOString());
      for (const r of (seen ?? []) as { message_id: string }[]) seenRows.push(r);
      seenRows.forEach((r) => known.add(r.message_id));
      // Our own team's addresses are never a candidate reply.
      const { data: staffRows } = await admin.from("profiles").select("email");
      const staffEmails = new Set(((staffRows ?? []) as { email: string | null }[]).map((r) => (r.email ?? "").toLowerCase()).filter(Boolean));

      for await (const msg of client.fetch(uids, { source: true, envelope: true }, { uid: false })) {
        if (!msg.source) continue;
        const mail = await simpleParser(msg.source);
        const messageId = (mail.messageId ?? `${msg.uid}-${mail.date?.getTime() ?? 0}`).trim();
        if (known.has(messageId)) continue;
        known.add(messageId);
        out.read++;

        const from = (mail.from?.value?.[0]?.address ?? "").toLowerCase();
        const subject = (mail.subject ?? "").slice(0, 200);
        const body = mail.text ?? "";
        const received = (mail.date ?? new Date()).toISOString();
        const record = async (status: string, extra: Record<string, unknown> = {}) => {
          await admin.from("email_replies").upsert({ message_id: messageId, from_email: from || null, subject, received_at: received, status, snippet: newTextOf(body).slice(0, 300), ...extra }, { onConflict: "message_id" });
        };

        // Mail from ourselves is never a reply.
        if (!from || from === user.toLowerCase() || staffEmails.has(from)) {
          await record("not_a_reply");
          out.ignored++;
          continue;
        }

        // A delivery-failure notice: pause that address everywhere so we stop writing to a dead mailbox.
        if (/mailer-daemon|postmaster/i.test(from) || /delivery status notification|undeliverable|undelivered|returned mail|delivery failure|failure notice/i.test(subject)) {
          // Only a permanently dead address is paused. "Inbox full" or "delivery delayed" is temporary:
          // it is recorded, but the person keeps getting email.
          const looksTemporary = /(delivery incomplete|temporary problem|will retry|retry for|inbox full|mailbox full|over quota|quota exceeded|try again later|\b4\.\d\.\d\b)/i.test(body);
          const looksPermanent = /(address not found|couldn'?t be found|unable to receive|does not exist|no such user|user unknown|domain not found|\b5\.1\.[01]\b|\b550\b)/i.test(body);
          const isHard = looksPermanent && !looksTemporary;
          const failed = Array.from(new Set((body.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase()))).filter(
            (e) => e !== user.toLowerCase() && !/mailer-daemon|postmaster/.test(e) && !e.endsWith("@googlemail.com")
          );
          let candidateId: string | null = null;
          for (const e of failed.slice(0, 3)) {
            const { data: c } = await admin.from("candidates").select("id").ilike("email", e).maybeSingle();
            if (c) {
              candidateId = c.id as string;
              if (isHard) await admin.from("candidates").update({ email_opt_out: true, profile_nudge_unsubscribed: true }).eq("id", candidateId);
            }
          }
          await record(isHard ? "bounced" : "soft_bounce", { candidate_id: candidateId });
          if (isHard) out.bounced++;
          else out.softBounced++;
          continue;
        }

        // Out-of-office and other automatic replies carry no answer.
        if (/out of office|automatic reply|auto-?reply|vacation|away from/i.test(subject) || mail.headers.get("auto-submitted")) {
          await record("not_a_reply");
          out.ignored++;
          continue;
        }

        const { data: cand } = await admin.from("candidates").select(FIELD_COLUMNS).ilike("email", from).maybeSingle();
        if (!cand) {
          await record("no_candidate");
          out.noCandidate++;
          continue;
        }

        // Only people we actually wrote to in the last two months.
        const cutoff = new Date(new Date().getTime() - 60 * 86_400_000).toISOString();
        const [o, w, n] = await Promise.all([
          admin.from("profile_outreach").select("id").eq("candidate_id", cand.id).eq("status", "sent").gte("created_at", cutoff).limit(1),
          admin.from("welcome_queue").select("candidate_id").eq("candidate_id", cand.id).eq("status", "sent").gte("sent_at", cutoff).limit(1),
          admin.from("audit_log").select("id").eq("action", "profile_nudge_sent").eq("entity_id", cand.id).gte("at", cutoff).limit(1),
        ]);
        const wroteTo = (o.data?.length ?? 0) + (w.data?.length ?? 0) + (n.data?.length ?? 0) > 0;
        const answersOurSubject = /^\s*re:/i.test(subject) && /(confirm your (profile|details)|complete your|details to match you|present your profile|presented|one last note about your profile|still need a few details|StaffAnchor)/i.test(subject);
        if (!wroteTo && !answersOurSubject) {
          await record("not_a_reply", { candidate_id: cand.id });
          out.ignored++;
          continue;
        }

        const text = newTextOf(body);
        if (/\b(unsubscribe|stop (emailing|sending|these)|remove me|do not (email|contact)|not interested)\b/i.test(text.slice(0, 400))) {
          await admin.from("candidates").update({ email_opt_out: true }).eq("id", cand.id);
          await record("opt_out", { candidate_id: cand.id });
          out.optedOut++;
          continue;
        }

        const wanted = missingKeyDetails(cand as KeyDetailCandidate).map((m) => m.key).filter((k) => SAFE_FIELDS.includes(k));
        const filled = wanted.length ? await readReplyFields(text, wanted) : {};
        const patch: Record<string, number | string> = {};
        for (const [k, v] of Object.entries(filled)) if (SAFE_FIELDS.includes(k) && wanted.includes(k)) patch[k] = v;
        if (Object.keys(patch).length === 0) {
          await record("unclear", { candidate_id: cand.id });
          out.unclear++;
          continue;
        }
        const { error } = await admin.from("candidates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", cand.id);
        if (error) {
          await record("unclear", { candidate_id: cand.id });
          out.unclear++;
          continue;
        }
        await admin.from("audit_log").insert({ actor: null, action: "profile_filled_from_email_reply", entity: "candidate", entity_id: cand.id, detail: { fields: Object.keys(patch) } });
        await record("applied", { candidate_id: cand.id, applied: patch });
        out.applied++;
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return out;
  } catch (e) {
    try {
      await client.logout();
    } catch {
      /* already closed */
    }
    return { ...out, ok: false, error: friendlyError(e) };
  }
}
