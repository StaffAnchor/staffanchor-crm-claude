import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactKind } from "./classify";
import type { Answers, BotState } from "./flow";
import { bestAnswer, normalizeQuestion, type FaqAnswer } from "./faq";
import { sendEmail, renderEmailShell } from "@/lib/mail";

// Everything the engine reads and writes, behind one small interface, so the rules can be
// tested against an in-memory copy and run in production against the database.

export interface Contact {
  phone_key: string;
  kind: ContactKind;
  kind_source: "text" | "identity" | "menu" | "manual";
  candidate_id: string | null;
  display_name: string | null;
  archived_at: string | null;
  muted: boolean;
  bot_paused: boolean;
  needs_human: boolean;
  needs_human_reason: string | null;
  opted_out: boolean;
  bot_state: Partial<BotState>;
  bot_version: number;
}

export interface CandidateLite {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_hold?: boolean | null;
  open_to_relocation?: string | null;
  /** True when neither the candidate, a recruiter nor the CV makes their role level clear. */
  role_level_unclear?: boolean;
  status: string;
  current_job_title: string | null;
  current_employer: string | null;
  total_experience_years: number | null;
  category: string | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
  current_location: string | null;
  resume_file_url: string | null;
}

export interface Identity {
  candidate: CandidateLite | null;
  employer: boolean;
  referrer: boolean;
}

export interface LoggedMessage {
  candidate_id: string | null;
  direction: "inbound" | "outbound";
  to_phone: string;
  body_preview: string | null;
  status: "sent" | "failed" | "not_configured" | "delivered";
  template_name?: string | null;
  meta_message_id?: string | null;
  error?: string | null;
}

export interface Store {
  getContact(key: string): Promise<Contact | null>;
  createContact(key: string): Promise<Contact>;
  /** Write fields on a contact. With `expectVersion`, only if nobody else changed it first. Returns whether it applied. */
  updateContact(key: string, patch: Partial<Omit<Contact, "phone_key" | "bot_version">>, expectVersion?: number): Promise<boolean>;
  lookupIdentity(key: string): Promise<Identity>;
  findCandidateByEmail(email: string): Promise<CandidateLite | null>;
  /** Profiles whose full name is exactly this (ignoring case and extra spaces). At most a few. */
  findCandidatesByName(name: string): Promise<CandidateLite[]>;
  /** Save another number for the same person, so the next message from it is recognised. */
  addAlternatePhone(id: string, phone: string): Promise<void>;
  createCandidate(a: Answers, phone: string): Promise<{ id: string } | { error: string }>;
  /** Fill blanks only; never overwrite what a candidate or recruiter already entered. */
  fillCandidate(id: string, a: Answers, phone: string): Promise<void>;
  setCandidateResume(id: string, path: string): Promise<void>;
  uploadResume(path: string, bytes: Uint8Array, contentType: string | null): Promise<string | null>;
  logMessage(m: LoggedMessage): Promise<void>;
  countBotMessagesSince(key: string, sinceIso: string, template?: string): Promise<number>;
  getCandidate(id: string): Promise<CandidateLite | null>;
  /** Read the candidate's CV and fill blanks (company, title, selling type). Returns the company the CV names as current, if any. Never throws. */
  enrichFromCv(candidateId: string): Promise<{ cvEmployer: string | null }>;
  /** Keep a file someone sent (a JD, say) and tie it to the message it came in. */
  saveAttachment(metaMessageId: string, path: string, bytes: Uint8Array, name: string | null, contentType: string | null): Promise<boolean>;
  hasOutboundSince(key: string, sinceIso: string): Promise<boolean>;
  /** A person answered a role-opportunity message. Records it against the role they were told about, and on "interested" puts them on that role's pipeline. */
  recordOutreachReply?(candidateId: string, answer: "interested" | "not_now"): Promise<void>;
  /** A person answered "are you open to hearing about new roles?". Yes ranks them higher; "not right now" rests them for 90 days. */
  recordOpenToWork?(candidateId: string, open: boolean): Promise<void>;
  /** The best answer a recruiter has taught for this question, if it is clearly the same question. */
  findFaqAnswer?(text: string): Promise<{ id: string; answer: string } | null>;
  /** A question the assistant could not answer, kept so a person can answer it once for everyone. */
  logUnansweredQuestion?(phoneKey: string, candidateId: string | null, text: string, reason: string | null): Promise<void>;
  /** An employer has just written in. Tells the admin at once (bell and email), at most once every 12 hours per number. */
  alertEmployer?(phoneKey: string, name: string | null, text: string | null): Promise<void>;
}

const CANDIDATE_COLUMNS =
  "id, full_name, email, phone, phone_hold, open_to_relocation, status, current_job_title, current_employer, total_experience_years, category, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, resume_file_url";

export function supabaseStore(admin: SupabaseClient): Store {
  const getContact = async (key: string) => {
    const { data } = await admin.from("whatsapp_contacts").select("*").eq("phone_key", key).maybeSingle();
    return (data as Contact | null) ?? null;
  };
  return {
    getContact,
    async createContact(key) {
      const { data } = await admin.from("whatsapp_contacts").insert({ phone_key: key }).select("*").maybeSingle();
      if (data) return data as Contact;
      // Lost a race with another message from the same person: read the row that won.
      const existing = await getContact(key);
      if (!existing) throw new Error("Could not create or read the WhatsApp contact");
      return existing;
    },
    async updateContact(key, patch, expectVersion) {
      const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
      let q = admin.from("whatsapp_contacts").update(expectVersion === undefined ? next : { ...next, bot_version: expectVersion + 1 }).eq("phone_key", key);
      if (expectVersion !== undefined) q = q.eq("bot_version", expectVersion);
      const { data, error } = await q.select("phone_key");
      return !error && !!data && data.length > 0;
    },
    async lookupIdentity(key) {
      const { data } = await admin.rpc("whatsapp_identity_lookup", { p_key: key });
      const d = (data ?? {}) as { candidate?: CandidateLite | null; employer?: boolean; referrer?: boolean };
      return { candidate: d.candidate ?? null, employer: !!d.employer, referrer: !!d.referrer };
    },
    async findCandidateByEmail(email) {
      const { data } = await admin.from("candidates").select(CANDIDATE_COLUMNS).ilike("email", email).limit(1).maybeSingle();
      return (data as CandidateLite | null) ?? null;
    },
    async findCandidatesByName(name) {
      const clean = name.trim().replace(/\s+/g, " ").replace(/[%_,()]/g, "");
      if (clean.split(" ").length < 2) return [];
      const { data } = await admin.from("candidates").select(CANDIDATE_COLUMNS).ilike("full_name", clean).limit(4);
      return ((data ?? []) as CandidateLite[]).filter((c) => (c.full_name ?? "").trim().replace(/\s+/g, " ").toLowerCase() === clean.toLowerCase());
    },
    async addAlternatePhone(id, phone) {
      const { addAlternatePhone } = await import("@/lib/alt-phone");
      await addAlternatePhone(admin, id, phone);
    },
    async createCandidate(a, phone) {
      const { data, error } = await admin
        .from("candidates")
        .insert({
          full_name: a.full_name ?? null,
          email: a.email,
          phone,
          current_job_title: a.current_job_title ?? null,
          current_employer: a.current_employer ?? null,
          total_experience_years: a.total_experience_years ?? null,
          category: a.category ?? null,
          current_fixed_ctc: a.current_fixed_ctc ?? null,
          expected_fixed_ctc: a.expected_fixed_ctc ?? null,
          notice_period: a.notice_period ?? null,
          current_location: a.current_location ?? null,
          status: "lead",
          profile_stage: "lead",
          created_by: "whatsapp",
          whatsapp_opt_in: true,
        })
        .select("id")
        .single();
      if (error || !data) return { error: error?.message ?? "insert failed" };
      return { id: data.id as string };
    },
    async fillCandidate(id, a, phone) {
      const { data: cur } = await admin.from("candidates").select(CANDIDATE_COLUMNS).eq("id", id).maybeSingle();
      if (!cur) return;
      const c = cur as CandidateLite;
      const patch: Record<string, unknown> = {};
      const blank = (v: unknown) => v === null || v === undefined || v === "";
      const set = (col: keyof CandidateLite, v: unknown) => {
        if (!blank(v) && blank(c[col])) patch[col] = v;
      };
      set("full_name", a.full_name);
      set("phone", phone);
      set("current_job_title", a.current_job_title);
      set("current_employer", a.current_employer);
      set("total_experience_years", a.total_experience_years);
      set("category", a.category);
      set("current_fixed_ctc", a.current_fixed_ctc);
      set("expected_fixed_ctc", a.expected_fixed_ctc);
      set("notice_period", a.notice_period);
      set("current_location", a.current_location);
      if (Object.keys(patch).length === 0) return;
      await admin.from("candidates").update({ ...patch, whatsapp_opt_in: true, updated_at: new Date().toISOString() }).eq("id", id);
    },
    async setCandidateResume(id, path) {
      await admin.from("candidates").update({ resume_file_url: path, updated_at: new Date().toISOString() }).eq("id", id).is("resume_file_url", null);
    },
    async uploadResume(path, bytes, contentType) {
      const { error } = await admin.storage.from("resumes").upload(path, bytes, { contentType: contentType ?? undefined });
      return error ? error.message : null;
    },
    async logMessage(m) {
      await admin.from("whatsapp_messages").insert({
        candidate_id: m.candidate_id,
        direction: m.direction,
        to_phone: m.to_phone,
        body_preview: m.body_preview,
        status: m.status,
        template_name: m.template_name ?? null,
        meta_message_id: m.meta_message_id ?? null,
        error: m.error ?? null,
      });
    },
    async countBotMessagesSince(key, sinceIso, template) {
      const { count } = await admin
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .like("template_name", template ?? "bot:%")
        .ilike("to_phone", `%${key}`)
        .gte("created_at", sinceIso);
      return count ?? 0;
    },
    async getCandidate(id) {
      const { data } = await admin.from("candidates").select(`${CANDIDATE_COLUMNS}, segment_data`).eq("id", id).maybeSingle();
      if (!data) return null;
      const row = data as unknown as CandidateLite & { segment_data?: { role_level?: string } | null };
      // Role level is "unclear" unless it was stated on the profile or the inventory could tell it from the CV.
      const stated = typeof row.segment_data?.role_level === "string" && row.segment_data.role_level.trim() !== "";
      let known = stated;
      if (!known) {
        const { data: tags } = await admin.from("candidate_role_tags").select("seniority").eq("candidate_id", id).eq("is_current", true);
        known = ((tags ?? []) as { seniority: string }[]).some((t) => t.seniority !== "unclear");
      }
      const { segment_data, ...rest } = row as CandidateLite & { segment_data?: unknown };
      void segment_data;
      return { ...rest, role_level_unclear: !known } as CandidateLite;
    },
    async enrichFromCv(candidateId) {
      try {
        const { extractCvFactsForCandidate } = await import("@/lib/cv-facts");
        // The AI read can be slow. Give it 30 seconds, then carry on without it.
        const read = await Promise.race([extractCvFactsForCandidate(candidateId, admin), new Promise<null>((r) => setTimeout(() => r(null), 30_000))]);
        if (!read || !read.ok) return { cvEmployer: null };
        const { data } = await admin.from("candidate_cv_facts").select("facts").eq("candidate_id", candidateId).maybeSingle();
        const facts = data?.facts as { roles?: { company: string | null; title: string | null; is_current: boolean; end: string | null }[]; sales?: { customer_type: string | null } } | undefined;
        const current = (facts?.roles ?? []).find((r) => r.is_current && r.company) ?? null;
        const { data: cur } = await admin.from("candidates").select("current_employer, current_job_title, category").eq("id", candidateId).maybeSingle();
        const patch: Record<string, unknown> = {};
        const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
        if (current?.company && blank(cur?.current_employer)) patch.current_employer = current.company;
        if (current?.title && blank(cur?.current_job_title)) patch.current_job_title = current.title;
        const ct = facts?.sales?.customer_type;
        if (blank(cur?.category) && (ct === "b2b" || ct === "b2c")) patch.category = ct === "b2b" ? "b2b_sales" : "b2c_sales";
        if (Object.keys(patch).length) await admin.from("candidates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", candidateId);
        return { cvEmployer: current?.company ?? null };
      } catch (err) {
        console.error("[whatsapp-bot] CV enrichment failed", err instanceof Error ? err.message : err);
        return { cvEmployer: null };
      }
    },
    async saveAttachment(metaMessageId, path, bytes, name, contentType) {
      const { error } = await admin.storage.from("client-resources").upload(path, bytes, { contentType: contentType ?? undefined });
      if (error) return false;
      await admin.from("whatsapp_messages").update({ media_path: path, media_name: name, media_type: contentType }).eq("meta_message_id", metaMessageId);
      return true;
    },
    async hasOutboundSince(key, sinceIso) {
      const { data } = await admin.from("whatsapp_messages").select("id").eq("direction", "outbound").ilike("to_phone", `%${key}`).gte("created_at", sinceIso).limit(1);
      return !!data && data.length > 0;
    },
    async findFaqAnswer(text) {
      const { data } = await admin.from("bot_answers").select("id, question, keywords, answer").eq("active", true).limit(500);
      const hit = bestAnswer(text, (data ?? []) as FaqAnswer[]);
      if (!hit) return null;
      const { data: row } = await admin.from("bot_answers").select("uses").eq("id", hit.id).maybeSingle();
      await admin.from("bot_answers").update({ uses: Number(row?.uses ?? 0) + 1, last_used_at: new Date().toISOString() }).eq("id", hit.id);
      return { id: hit.id, answer: hit.answer };
    },
    async logUnansweredQuestion(phoneKey, candidateId, text, reason) {
      const clean = text.trim().slice(0, 500);
      if (!clean) return;
      await admin.from("bot_questions").insert({ phone_key: phoneKey, candidate_id: candidateId, text: clean, norm: normalizeQuestion(clean).slice(0, 300), reason });
    },
    async alertEmployer(phoneKey, name, text) {
      const since = new Date(Date.now() - 12 * 3600_000).toISOString();
      const link = `/whatsapp?c=${phoneKey}`;
      const { data: recent } = await admin.from("notifications").select("id").eq("type", "employer_whatsapp").eq("link", link).gte("created_at", since).limit(1);
      if (recent?.length) return;
      const who = name?.trim() || "An employer";
      const preview = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
      if (admins?.length) {
        await admin.from("notifications").insert(
          admins.map((a: { id: string }) => ({ user_id: a.id, type: "employer_whatsapp", title: `${who} wrote to us on WhatsApp`, body: preview || "Employer enquiry", link })),
        );
      }
      const to = process.env.INQUIRY_ALERT_TO || "gagan@staffanchor.com";
      const phone = `+91 ${phoneKey}`;
      const url = `https://clients.staffanchor.com${link}`;
      const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await sendEmail({
        to,
        subject: `Employer on WhatsApp: ${who} (${phone})`,
        text: `${who} wrote to us on WhatsApp.\nPhone: ${phone}\n${preview ? `Message: ${preview}\n` : ""}\nOpen the chat: ${url}`,
        html: renderEmailShell({
          preheader: `${who} wrote to us on WhatsApp.`,
          bodyHtml: `<p style="margin:0 0 12px;">An employer just wrote to us on WhatsApp.</p><p style="margin:0 0 6px;"><b>${esc(who)}</b><br/>Phone: <a href="tel:${phone.replace(/\s/g, "")}">${phone}</a></p>${preview ? `<p style="margin:8px 0;color:#475569;">&ldquo;${esc(preview)}&rdquo;</p>` : ""}<p style="margin:16px 0 0;"><a href="${url}" style="color:#2563eb;">Open the chat</a></p>`,
        }),
      }).catch(() => {});
    },
    async recordOpenToWork(candidateId, open) {
      await admin
        .from("candidates")
        .update(open ? { open_to_work_at: new Date().toISOString(), not_now_until: null } : { not_now_until: new Date(Date.now() + 90 * 86_400_000).toISOString() })
        .eq("id", candidateId);
    },
    async recordOutreachReply(candidateId, answer) {
      // The role they most recently heard about, within three weeks; an old message is not what they are answering.
      const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
      const { data } = await admin
        .from("mandate_outreach")
        .select("mandate_id, sent_by")
        .eq("candidate_id", candidateId)
        .eq("status", "sent")
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      await admin.from("mandate_outreach").update({ status: answer, replied_at: new Date().toISOString() }).eq("mandate_id", data.mandate_id).eq("candidate_id", candidateId);
      if (answer === "interested") {
        // Duplicates are fine: they may already be on the pipeline.
        await admin.from("candidate_mandate_links").insert({
          candidate_id: candidateId,
          mandate_id: data.mandate_id,
          added_by: data.sent_by,
          match_source: "whatsapp_interest",
          matched_at: new Date().toISOString(),
        });
      }
    },
  };
}
