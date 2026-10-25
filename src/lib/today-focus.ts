import type { SupabaseClient } from "@supabase/supabase-js";
import { groupConversations, type WaMessage } from "@/lib/whatsapp-threads";
import { statusOf, type WaContactLite } from "@/lib/whatsapp-status";
import { REMINDER_FRESH_DAYS, ROUTINE_TASK_TYPES, TASK_FRESH_DAYS, type DeskTask, type TodayDesk } from "@/lib/today-desk";

// The few things most worth doing right now, in order, each with one action. Built from what the CRM already knows:
// people waiting on a WhatsApp reply, calls promised back, real tasks, and the role-level decisions on the desk. Bulk
// housekeeping never appears here; it is handled by the automation.

export type FocusCard = {
  id: string;
  kind: "chat" | "callback" | "task" | "decision" | "money" | "checkin";
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

  // Calls promised back from the Calls today form: a "call later" whose time has come, with no call to that person since.
  const nowIso = new Date(now).toISOString();
  const { data: laterRows } = await supabase
    .from("call_log")
    .select("id, candidate_id, call_back_at, created_at, candidates(full_name, phone)")
    .eq("caller_id", userId)
    .eq("outcome", "call_later")
    .not("call_back_at", "is", null)
    .lte("call_back_at", nowIso)
    .order("call_back_at", { ascending: true })
    .limit(20);
  type Later = { id: string; candidate_id: string; call_back_at: string; created_at: string; candidates: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null };
  const laters = (laterRows ?? []) as unknown as Later[];
  if (laters.length > 0) {
    const { data: since } = await supabase.from("call_log").select("candidate_id, created_at").in("candidate_id", Array.from(new Set(laters.map((l) => l.candidate_id)))).gte("created_at", laters.reduce((m, l) => (l.created_at < m ? l.created_at : m), laters[0].created_at));
    const seen = new Set<string>();
    for (const l of laters) {
      if (seen.has(l.candidate_id)) continue;
      if (((since ?? []) as { candidate_id: string; created_at: string }[]).some((x) => x.candidate_id === l.candidate_id && x.created_at > l.created_at)) continue;
      seen.add(l.candidate_id);
      const cand = Array.isArray(l.candidates) ? l.candidates[0] : l.candidates;
      const late = Math.floor((now - new Date(l.call_back_at).getTime()) / DAY);
      cards.push({
        id: `cl:${l.id}`,
        kind: "callback",
        title: `Call back ${cand?.full_name ?? "this person"}`,
        why: late >= 1 ? `You said you'd call back. That was ${late} day${late === 1 ? "" : "s"} ago.` : "You said you'd call back about now.",
        value: null,
        href: `/candidates/${l.candidate_id}`,
        actionLabel: "Open profile",
        candidate: { id: l.candidate_id, name: cand?.full_name ?? null, phone: cand?.phone ?? null },
        mandateId: null,
        taskId: null,
        rank: 92,
      });
    }
  }

  // Money owed: an invoice emailed to the client a week or more ago with no payment recorded (the same rule as the billing page). The reminder itself stays a button on the
  // billing page, where the message is shown before it goes; nothing here sends anything.
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const { data: dueTr } = await supabase
    .from("placement_fee_tranches")
    .select("id, proforma_sent_at, proforma_reminder_count, mandates(role_title, client_name), candidate_mandate_links(candidates(full_name))")
    .eq("status", "proforma_sent")
    .is("payment_received_at", null)
    .is("cancelled_at", null)
    .not("proforma_sent_at", "is", null)
    .lt("proforma_sent_at", new Date(now - 7 * DAY).toISOString())
    .order("proforma_sent_at", { ascending: true })
    .limit(4);
  for (const t of (dueTr ?? []) as unknown as { id: string; proforma_sent_at: string; proforma_reminder_count: number | null; mandates: One<{ role_title: string | null; client_name: string | null }>; candidate_mandate_links: One<{ candidates: One<{ full_name: string | null }> }> }[]) {
    const m = one(t.mandates);
    const person = one(one(t.candidate_mandate_links)?.candidates ?? null)?.full_name;
    const days = Math.floor((now - new Date(t.proforma_sent_at).getTime()) / DAY);
    const n = t.proforma_reminder_count ?? 0;
    cards.push({
      id: `pay:${t.id}`,
      kind: "money",
      title: `${m?.client_name ?? "A client"} has not paid: invoice sent ${days} days ago`,
      why: `${[person, m?.role_title].filter(Boolean).join(" · ")}. ${n === 0 ? "No reminder sent yet." : `${n} reminder${n === 1 ? "" : "s"} sent.`}`,
      value: null,
      href: "/analytics/billing",
      actionLabel: "Review and remind",
      candidate: null,
      mandateId: null,
      taskId: null,
      rank: 88,
    });
  }

  // After joining: the 30, 90 and 180-day check-ins that are due or overdue (they decide whether the fee is safe).
  const soon = new Date(now + 2 * DAY).toISOString().slice(0, 10);
  const { data: cks } = await supabase
    .from("placement_retention_checkins")
    .select("id, checkin_type, due_date, candidate_mandate_links(candidate_id, candidates(full_name), mandates(role_title, client_name))")
    .is("completed_at", null)
    .lte("due_date", soon)
    .order("due_date", { ascending: true })
    .limit(6);
  for (const k of (cks ?? []) as unknown as { id: string; checkin_type: string; due_date: string; candidate_mandate_links: One<{ candidate_id: string; candidates: One<{ full_name: string | null }>; mandates: One<{ role_title: string | null; client_name: string | null }> }> }[]) {
    const link = one(k.candidate_mandate_links);
    const person = one(link?.candidates ?? null)?.full_name;
    const m = one(link?.mandates ?? null);
    const days = Math.floor((now - new Date(k.due_date).getTime()) / DAY);
    cards.push({
      id: `ck:${k.id}`,
      kind: "checkin",
      title: `${k.checkin_type.replace("_day", "-day")} check-in: ${person ?? "the new joiner"}`,
      why: `${[m?.client_name, m?.role_title].filter(Boolean).join(" · ")}. ${days > 0 ? `${days} day${days === 1 ? "" : "s"} overdue.` : days === 0 ? "Due today." : "Due soon."} Ask how they are doing and whether they are staying.`,
      value: null,
      href: "/placements",
      actionLabel: "Record the check-in",
      candidate: null,
      mandateId: null,
      taskId: null,
      rank: days > 0 ? 84 : 74,
    });
  }

  cards.sort((a, b) => b.rank - a.rank);
  // The money, joiner and role decisions must not be crowded out by chats: if fewer than three made the first eight, the
  // best ones swap in for the lowest of the rest.
  const important = (c: FocusCard) => c.kind === "money" || c.kind === "checkin" || c.kind === "decision";
  const top = cards.slice(0, 8);
  const extra = cards.slice(8).filter(important).slice(0, Math.max(0, 3 - top.filter(important).length));
  for (const e of extra) {
    let at = -1;
    for (let i = top.length - 1; i >= 0; i--) if (!important(top[i])) { at = i; break; }
    if (at >= 0) top[at] = e;
  }
  top.sort((a, b) => b.rank - a.rank);
  return { cards: top, feesInPlay };
}
