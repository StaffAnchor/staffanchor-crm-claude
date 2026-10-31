import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallPerson } from "@/app/(dashboard)/candidates/calls/calls-desk";
import { loadUrgentRoleMatches } from "@/lib/urgent-role-calls";

// The calls that come before everything else: people who paid for a recruiter call (soonest deadline first), people who
// said yes to a role, call-backs that are due, and people matching a role marked urgent who still lack details.
export type PriorityCalls = {
  people: CallPerson[];
  counts: { paid: number; callbacks: number; interested: number; urgent: number };
  urgentRoles: { title: string; client: string | null }[];
};

type PaidLink = { candidate_id: string; call_paid_at: string; call_due_at: string | null; mandates: { role_title: string | null } | { role_title: string | null }[] | null; candidates: Record<string, unknown> | Record<string, unknown>[] | null };

export async function loadPriorityCalls(supabase: SupabaseClient): Promise<PriorityCalls> {
  const [{ data: regularRows }, urgent, { data: paidLinks }] = await Promise.all([
    supabase.rpc("calls_today", { p_limit: 100, p_focus: "mixed" }),
    loadUrgentRoleMatches(supabase).catch(() => ({ roles: [], matches: [] })),
    supabase
      .from("candidate_mandate_links")
      .select("candidate_id, call_paid_at, call_due_at, mandates(role_title), candidates(id, full_name, phone, current_job_title, current_employer, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, open_to_relocation, work_mode, resume_file_url, source_channel, created_by, created_at, status)")
      .not("call_paid_at", "is", null)
      .is("call_refunded_at", null)
      .order("call_due_at", { ascending: true })
      .limit(60),
  ]);

  const leads = ((regularRows ?? []) as CallPerson[])
    .filter((p) => p.reason === "call_back" || p.reason === "interested")
    .map((p) => ({ ...p, resume_url: null as string | null }));

  let urgentPeople: CallPerson[] = [];
  if (urgent.matches.length > 0) {
    const bestFor = new Map<string, (typeof urgent.matches)[number]>();
    for (const m of urgent.matches) {
      const cur = bestFor.get(m.candidateId);
      if (!cur || (m.bucket === "perfect" && cur.bucket !== "perfect") || (m.bucket === cur.bucket && m.order < cur.order)) bestFor.set(m.candidateId, m);
    }
    const { data: urgentRows } = await supabase.rpc("calls_for_candidates", { p_ids: Array.from(bestFor.keys()) });
    const lacks = (p: CallPerson) => !p.current_fixed_ctc || !p.notice_period || !p.expected_fixed_ctc || !p.current_location;
    urgentPeople = ((urgentRows ?? []) as CallPerson[])
      .filter(lacks)
      .map((p) => {
        const m = bestFor.get(p.id)!;
        return { p: { ...p, resume_url: null as string | null, reason: "urgent_role" as const, urgent_role: { title: m.roleTitle, bucket: m.bucket } }, m };
      })
      .sort((a, b) => (a.m.bucket === b.m.bucket ? a.m.order - b.m.order : a.m.bucket === "perfect" ? -1 : 1))
      .slice(0, 25)
      .map((x) => x.p);
  }

  const paidList = (paidLinks ?? []) as unknown as PaidLink[];
  const { data: paidLogged } = paidList.length ? await supabase.from("call_log").select("candidate_id, created_at").in("candidate_id", paidList.map((l) => l.candidate_id)) : { data: [] as { candidate_id: string; created_at: string }[] };
  const calledAfter = (l: PaidLink) => ((paidLogged ?? []) as { candidate_id: string; created_at: string }[]).some((c) => c.candidate_id === l.candidate_id && c.created_at >= l.call_paid_at);
  const paidPeople: CallPerson[] = paidList
    .filter((l) => !calledAfter(l))
    .map((l) => {
      const c = (Array.isArray(l.candidates) ? l.candidates[0] : l.candidates) as Record<string, never> | null;
      const m = Array.isArray(l.mandates) ? l.mandates[0] : l.mandates;
      if (!c) return null;
      return {
        id: c.id, full_name: c.full_name, phone: c.phone, current_job_title: c.current_job_title, current_employer: c.current_employer,
        total_experience_years: c.total_experience_years, current_fixed_ctc: c.current_fixed_ctc, expected_fixed_ctc: c.expected_fixed_ctc,
        notice_period: c.notice_period, current_location: c.current_location, open_to_relocation: c.open_to_relocation, work_mode: c.work_mode,
        resume_file_url: c.resume_file_url, resume_url: null as string | null, pay_ratio: null, comm: null, open_fresh: false,
        reason: "paid_call" as const, paid_call: { title: m?.role_title ?? "Role", due: l.call_due_at }, tries: 0, last_outcome: null,
        source: (c.source_channel as string | null) || (c.created_by as string | null), profile_created_at: c.created_at, profile_status: c.status,
      } as CallPerson;
    })
    .filter((p): p is CallPerson => p !== null);

  const paidIds = new Set(paidPeople.map((p) => p.id));
  const leadList = leads.filter((p) => !paidIds.has(p.id));
  const leadIds = new Set(leadList.map((p) => p.id));
  const urgentOnly = urgentPeople.filter((p) => !paidIds.has(p.id) && !leadIds.has(p.id));
  return {
    people: [...paidPeople, ...leadList, ...urgentOnly],
    counts: { paid: paidPeople.length, callbacks: leadList.filter((p) => p.reason === "call_back").length, interested: leadList.filter((p) => p.reason === "interested").length, urgent: urgentOnly.length },
    urgentRoles: urgent.roles.map((r) => ({ title: r.title, client: r.client ?? null })),
  };
}
