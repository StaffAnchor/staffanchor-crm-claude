import type { SupabaseClient } from "@supabase/supabase-js";

// The CRM assistant. It can look anything up, but everything that changes something or reaches a person is a proposal an
// admin approves first. The jobs it can propose are listed here, with exactly what each one carries.

export type Ctx = {
  userId: string;
  /** The signed-in admin's own session: reads and writes obey their permissions. */
  supabase: SupabaseClient;
  /** Service role, used only for things the app already does with it (WhatsApp state, logs). */
  admin: SupabaseClient;
  threadId: string;
  /** The admin's cookie header, passed on when an approved proposal calls the CRM's existing routes. */
  cookie: string;
  origin: string;
  emit: (e: StreamEvent) => void;
};

export type StreamEvent =
  | { t: "status"; text: string }
  | { t: "proposal"; id: string }
  | { t: "text"; text: string }
  | { t: "error"; text: string }
  | { t: "done"; threadId: string };

export type ProposalKind =
  | "wa_reply"
  | "wa_template"
  | "email"
  | "create_client"
  | "create_mandate"
  | "add_to_mandate"
  | "note";

export type WaTemplateKind = "role_opportunity" | "interview" | "offer" | "followup" | "ask_missing";

export type Payloads = {
  wa_reply: { candidateId: string; body: string };
  wa_template: { template: WaTemplateKind; candidateIds: string[]; mandateId?: string };
  email: { to: "candidate" | "client_contact"; id: string; subject: string; body: string };
  create_client: { name: string; industry?: string; hq_city?: string; website?: string };
  create_mandate: {
    client_id?: string; client_name: string; role_title: string; role_cluster: string; seniority_band: string; cities: string[];
    experience_min?: number; experience_max?: number; budget_min?: number; budget_max?: number; headcount?: number; jd_overview?: string;
  };
  add_to_mandate: { mandateId: string; candidateIds: string[] };
  note: { candidateId: string; text: string; noteType: string };
};

export type ProposalRow = {
  id: string; thread_id: string | null; user_id: string; kind: ProposalKind; title: string; summary: string | null; payload: unknown; preview: unknown;
  status: "pending" | "approved" | "rejected" | "failed"; result: unknown; error: string | null; created_at: string; decided_at: string | null;
};

export const NOTE_TYPES = ["call_note", "reference_check", "client_feedback", "post_placement"];
export const SENIORITY_BANDS = ["ic", "team_lead", "manager", "director", "vp_plus"];
