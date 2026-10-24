import type { SupabaseClient } from "@supabase/supabase-js";

// Who is waiting on a person, in the order it costs us to leave them: employers first, then candidates who are
// on a live role, then a question the assistant could not answer. Candidates who only got the "recruiter will
// connect once you are shortlisted" reply are left out on purpose: not everyone needs a reply.

export type WaitingKind = "employer" | "candidate_on_role" | "question";

export type WaitingItem = {
  kind: WaitingKind;
  key: string;
  name: string;
  why: string;
  preview: string;
  hoursWaiting: number;
  href: string;
};

const LIVE_STAGES = ["screened", "submitted", "shortlisted", "client_shortlisted", "client_interview"];
const RANK: Record<WaitingKind, number> = { employer: 0, candidate_on_role: 1, question: 2 };

export const KIND_LABEL: Record<WaitingKind, string> = {
  employer: "Employer",
  candidate_on_role: "Candidate on a live role",
  question: "Question the assistant could not answer",
};

const tail10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

export async function loadWaiting(admin: SupabaseClient, now = Date.now()): Promise<WaitingItem[]> {
  const { data: contacts } = await admin
    .from("whatsapp_contacts")
    .select("phone_key, kind, display_name, candidate_id, needs_human_reason, updated_at")
    .eq("needs_human", true)
    .eq("opted_out", false)
    .eq("muted", false)
    .is("archived_at", null);
  const rows = contacts ?? [];
  if (!rows.length) return await questionsOnly(admin, now, new Set());

  const keys = rows.map((c) => c.phone_key as string);
  const since = new Date(now - 30 * 86_400_000).toISOString();
  const { data: msgs } = await admin
    .from("whatsapp_messages")
    .select("to_phone, direction, template_name, body_preview, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  // Last thing they said, and whether a person (not the assistant) answered after it.
  const lastIn = new Map<string, { at: string; text: string }>();
  const lastHuman = new Map<string, string>();
  for (const m of msgs ?? []) {
    const k = tail10(m.to_phone as string);
    if (!keys.includes(k)) continue;
    if (m.direction === "inbound") {
      if (!lastIn.has(k)) lastIn.set(k, { at: m.created_at as string, text: (m.body_preview as string) ?? "" });
    } else if (!(m.template_name as string | null)?.startsWith("bot:") && !lastHuman.has(k)) {
      lastHuman.set(k, m.created_at as string);
    }
  }

  const candidateIds = rows.map((c) => c.candidate_id).filter(Boolean) as string[];
  const onRole = new Set<string>();
  if (candidateIds.length) {
    const { data: links } = await admin.from("candidate_mandate_links").select("candidate_id").in("candidate_id", candidateIds).in("stage", LIVE_STAGES);
    for (const l of links ?? []) onRole.add(l.candidate_id as string);
  }

  const items: WaitingItem[] = [];
  const covered = new Set<string>();
  for (const c of rows) {
    const key = c.phone_key as string;
    const inb = lastIn.get(key);
    if (!inb) continue;
    const answered = lastHuman.get(key);
    if (answered && answered > inb.at) continue;
    const isEmployer = c.kind === "employer";
    const isOnRole = !!c.candidate_id && onRole.has(c.candidate_id as string);
    if (!isEmployer && !isOnRole) continue;
    covered.add(key);
    items.push({
      kind: isEmployer ? "employer" : "candidate_on_role",
      key,
      name: (c.display_name as string) || `+91 ${key}`,
      why: (c.needs_human_reason as string) || (isEmployer ? "Employer enquiry" : "Wrote in while on a live role"),
      preview: inb.text.replace(/\s+/g, " ").slice(0, 160),
      hoursWaiting: Math.max(0, Math.round((now - new Date(inb.at).getTime()) / 3_600_000)),
      href: "/whatsapp",
    });
  }
  const qs = await questionsOnly(admin, now, covered);
  return [...items, ...qs].sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.hoursWaiting - a.hoursWaiting);
}

async function questionsOnly(admin: SupabaseClient, now: number, covered: Set<string>): Promise<WaitingItem[]> {
  const { data } = await admin.from("bot_questions").select("phone_key, text, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(30);
  const seen = new Set<string>();
  const out: WaitingItem[] = [];
  for (const q of data ?? []) {
    const key = q.phone_key as string;
    if (covered.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "question",
      key,
      name: `+91 ${key}`,
      why: "The assistant could not answer this",
      preview: ((q.text as string) ?? "").replace(/\s+/g, " ").slice(0, 160),
      hoursWaiting: Math.max(0, Math.round((now - new Date(q.created_at as string).getTime()) / 3_600_000)),
      href: "/whatsapp/training",
    });
  }
  return out;
}
