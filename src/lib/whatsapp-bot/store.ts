import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactKind } from "./classify";
import type { Answers, BotState } from "./flow";

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
  createCandidate(a: Answers, phone: string): Promise<{ id: string } | { error: string }>;
  /** Fill blanks only; never overwrite what a candidate or recruiter already entered. */
  fillCandidate(id: string, a: Answers, phone: string): Promise<void>;
  setCandidateResume(id: string, path: string): Promise<void>;
  uploadResume(path: string, bytes: Uint8Array, contentType: string | null): Promise<string | null>;
  logMessage(m: LoggedMessage): Promise<void>;
  countBotMessagesSince(key: string, sinceIso: string): Promise<number>;
  hasOutboundSince(key: string, sinceIso: string): Promise<boolean>;
}

const CANDIDATE_COLUMNS =
  "id, full_name, email, phone, status, current_job_title, current_employer, total_experience_years, category, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, resume_file_url";

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
    async countBotMessagesSince(key, sinceIso) {
      const { count } = await admin
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .like("template_name", "bot:%")
        .ilike("to_phone", `%${key}`)
        .gte("created_at", sinceIso);
      return count ?? 0;
    },
    async hasOutboundSince(key, sinceIso) {
      const { data } = await admin.from("whatsapp_messages").select("id").eq("direction", "outbound").ilike("to_phone", `%${key}`).gte("created_at", sinceIso).limit(1);
      return !!data && data.length > 0;
    },
  };
}
