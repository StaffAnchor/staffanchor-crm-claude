import type { SupabaseClient } from "@supabase/supabase-js";
import { groupConversations, type WaMessage } from "@/lib/whatsapp-threads";
import { statusOf, type WaContactLite } from "@/lib/whatsapp-status";
import { REMINDER_FRESH_DAYS, ROUTINE_TASK_TYPES, TASK_FRESH_DAYS, type DeskTask, type TodayDesk } from "@/lib/today-desk";

// The few things most worth doing right now, in order, each with one action. Built from what the CRM already knows:
// people waiting on a WhatsApp reply, calls promised back, real tasks, and the role-level decisions on the desk. Bulk
// housekeeping never appears here; it is handled by the automation.

export type FocusCard = {
  id: string;
  kind: "chat" | "callback" | "task" | "decision";
  title: string;
  why: string;
  /** What it is worth, when we can say: the fee if this person is placed. */
  value: string | null;
  href: string;
  actionLabel: string;
  candidate: { id: string; name: string | null; phone: string | null } | null;
  mandateId: string | null;
  /** The inbox task to tick off when the card is done. */
  taskId: string | null;
  rank: number;
};

const TYPE_RANK: Record<string, number> = {
  CANDIDATE_CALL_REQUEST: 86,
  TRIGGER_INTERVIEW_COORDINATION: 84,
  FOLLOW_UP_ON_OFFER: 83,
  CLIENT_FEEDBACK_OVERDUE: 80,
  SECOND_ROUND_OUTCOME: 76,
  INTERVIEW_REMINDER: 74,
  POST_PLACEMENT_CHECKIN: 70,
  CLIENT_STAGE_UPDATE: 64,
  RESURFACED_MATCHES: 40,
};

const DAY = 86_400_000;
const lakh = (n: number) => `₹${n >= 10 ? Math.round(n) : n.toFixed(1)}L`;

export type FocusData = { cards: FocusCard[]; feesInPlay: { amount: string; people: number } | null };

export async function loadFocus(supabase: SupabaseClient, userId: string, desk: TodayDesk): Promise<FocusData> {
  const now = Date.now();
  const since3d = new Date(now - 3 * DAY).toISOString();

  const [tasksRes, callbacksRes, msgsRes, contactsRes, activeRes] = await Promise.all([
    supabase.rpc("get_my_inbox"),
    supabase.from("call_logs").select("id, candidate_id, mandate_id, callback_at, interest, candidates(full_name, phone)").eq("recruiter_id", userId).eq("callback_done", false).not("callback_at", "is", null).lte("callback_at", new Date(now).toISOString()).order("callback_at", { ascending: true }).limit(8),
    supabase.from("whatsapp_messages").select("id, created_at, candidate_id, direction, to_phone, body_preview, status, error, template_name, media_path, media_name").gte("created_at", since3d).order("created_at", { ascending: false }).limit(800),
    supabase.from("whatsapp_contacts").select("phone_key, kind, archived_at, muted, bot_paused, needs_human, needs_human_reason, opted_out, bot_state"),
    supabase.from("candidate_mandate_links").select("candidate_id, mandate_id, stage").in("stage", ["submitted", "client_shortlisted", "client_interview", "offer"]).limit(2000),
  ]);

  // Fee per role: the budget's top end times the client's fee percentage. Only where both are known.
  const mandateIds = new Set<string>();
  for (const l of (activeRes.data ?? []) as { mandate_id: string }[]) mandateIds.add(l.mandate_id);
  const tasks = ((tasksRes.data ?? []) as DeskTask[]).filter((t) => t && t.id);
  for (const t of tasks) if (t.mandate_id) mandateIds.add(t.mandate_id);
  const feeFor = new Map<string, number>();
  if (mandateIds.size > 0) {
    const { data: ms } = await supabase.from("mandates").select("id, budget_max, client_id").in("id", Array.from(mandateIds));
    const clientIds = Array.from(new Set(((ms ?? []) as { client_id: string | null }[]).map((m) => m.client_id).filter((v): v is string => !!v)));
    const { data: cs } = clientIds.length ? await supabase.from("clients").select("id, fee_percentage").in("id", clientIds) : { data: [] };
    const pct = new Map(((cs ?? []) as { id: string; fee_percentage: number | null }[]).map((c) => [c.id, Number(c.fee_percentage ?? 0)]));
    for (const m of (ms ?? []) as { id: string; budget_max: number | null; client_id: string | null }[]) {
      const p = m.client_id ? pct.get(m.client_id) ?? 0 : 0;
      if (m.budget_max && p > 0) feeFor.set(m.id, (Number(m.budget_max) * p) / 100);
    }
  }
  const valueOf = (mandateId: string | null) => {
    const f = mandateId ? feeFor.get(mandateId) : undefined;
    return f ? `${lakh(f)} fee if placed` : null;
  };

  let total = 0;
  let people = 0;
  for (const l of (activeRes.data ?? []) as { mandate_id: string }[]) {
    const f = feeFor.get(l.mandate_id);
    if (f) {
      total += f;
      people++;
    }
  }
  const feesInPlay = people > 0 ? { amount: lakh(total), people } : null;

  const cards: FocusCard[] = [];

  // Calls promised back.
  for (const c of (callbacksRes.data ?? []) as unknown as { id: string; candidate_id: string; mandate_id: string | null; interest: string | null; candidates: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null }[]) {
    const cand = Array.isArray(c.candidates) ? c.candidates[0] : c.candidates;
    cards.push({
      id: `cb:${c.id}`,
      kind: "callback",
      title: `Call back ${cand?.full_name ?? "this person"}`,
      why: c.interest === "yes" ? "They were interested. You said you'd call back." : "You said you'd call back.",
      value: valueOf(c.mandate_id),
      href: `/candidates/${c.candidate_id}`,
      actionLabel: "Open profile",
      candidate: { id: c.candidate_id, name: cand?.full_name ?? null, phone: cand?.phone ?? null },
      mandateId: c.mandate_id,
      taskId: null,
      rank: 92,
    });
  }

  // WhatsApp chats waiting on a person.
  const convs = groupConversations((msgsRes.data ?? []) as WaMessage[], now);
  const contacts = new Map<string, WaContactLite>();
  for (const r of (contactsRes.data ?? []) as { phone_key: string; kind: string; archived_at: string | null; muted: boolean; bot_paused: boolean; needs_human: boolean; needs_human_reason: string | null; opted_out: boolean; bot_state: { status?: string; step?: string } | null }[]) {
    contacts.set(r.phone_key, { kind: r.kind, archived: !!r.archived_at, muted: !!r.muted, botPaused: !!r.bot_paused, needsHuman: !!r.needs_human, reason: r.needs_human_reason, optedOut: !!r.opted_out, botStatus: r.bot_state?.status ?? null, botStep: r.bot_state?.step ?? null });
  }
  const waking = convs.filter((c) => statusOf(c, contacts.get(c.key), now).state === "needs_you" && !contacts.get(c.key)?.muted && (contacts.get(c.key)?.kind ?? "jobseeker") !== "employer").slice(0, 6);
  const waIds = Array.from(new Set(waking.map((c) => c.candidateId).filter((v): v is string => !!v)));
  const waCands = new Map<string, { full_name: string | null; phone: string | null }>();
  if (waIds.length) {
    const { data } = await supabase.from("candidates").select("id, full_name, phone").in("id", waIds);
    for (const c of (data ?? []) as { id: string; full_name: string | null; phone: string | null }[]) waCands.set(c.id, c);
  }
  for (const c of waking) {
    const st = statusOf(c, contacts.get(c.key), now);
    const cand = c.candidateId ? waCands.get(c.candidateId) : undefined;
    cards.push({
      id: `wa:${c.key}`,
      kind: "chat",
      title: `Reply to ${cand?.full_name ?? "a WhatsApp chat"}`,
      why: st.why,
      value: null,
      href: "/whatsapp",
      actionLabel: "Open the chat",
      candidate: c.candidateId ? { id: c.candidateId, name: cand?.full_name ?? null, phone: cand?.phone ?? c.phone } : null,
      mandateId: null,
      taskId: null,
      rank: st.urgency === "late" ? 95 : st.urgency === "soon" ? 90 : 82,
    });
  }

  // Real tasks (never the bulk housekeeping).
  const fresh = tasks.filter((t) => !ROUTINE_TASK_TYPES.has(t.task_type) && (!t.created_at || now - new Date(t.created_at).getTime() < (t.task_type === "INTERVIEW_REMINDER" ? REMINDER_FRESH_DAYS : TASK_FRESH_DAYS) * DAY));
  const taskIds = Array.from(new Set(fresh.map((t) => t.candidate_id).filter((v): v is string => !!v)));
  const taskCands = new Map<string, { phone: string | null }>();
  if (taskIds.length) {
    const { data } = await supabase.from("candidates").select("id, phone").in("id", taskIds);
    for (const c of (data ?? []) as { id: string; phone: string | null }[]) taskCands.set(c.id, c);
  }
  for (const t of fresh) {
    cards.push({
      id: `t:${t.id}`,
      kind: "task",
      title: t.title,
      why: t.detail || [t.mandate_client_name, t.mandate_role_title].filter(Boolean).join(" · ") || "Needs a person",
      value: valueOf(t.mandate_id),
      href: t.candidate_id ? `/candidates/${t.candidate_id}${t.mandate_id ? `?mandateId=${t.mandate_id}` : ""}` : t.mandate_id ? `/mandates/${t.mandate_id}` : "/tasks",
      actionLabel: t.candidate_id ? "Open profile" : "Open",
      candidate: t.candidate_id && t.task_type === "CANDIDATE_CALL_REQUEST" ? { id: t.candidate_id, name: t.candidate_name, phone: taskCands.get(t.candidate_id)?.phone ?? null } : null,
      mandateId: t.mandate_id,
      taskId: t.id,
      rank: (TYPE_RANK[t.task_type] ?? 55) + (t.priority === "high" ? 4 : 0),
    });
  }

  // The role-level decisions already worked out for the desk.
  for (const d of desk.decisions) {
    cards.push({ id: `d:${d.id}`, kind: "decision", title: d.title, why: d.detail, value: null, href: d.href, actionLabel: d.actionLabel, candidate: null, mandateId: null, taskId: null, rank: d.tone === "urgent" ? 78 : d.tone === "attention" ? 60 : 45 });
  }

  cards.sort((a, b) => b.rank - a.rank);
  return { cards: cards.slice(0, 8), feesInPlay };
}
