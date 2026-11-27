import type { SupabaseClient } from "@supabase/supabase-js";

// People who paid for a recruiter call. "Called" follows the same rule as the Calls desk and Reports:
// any call logged after the payment. A refunded payment is not shown.
export type PaidCall = { state: "waiting" | "overdue" | "called"; role: string; due: string | null };

type Row = { candidate_id: string; call_paid_at: string; call_due_at: string | null; mandates: { role_title: string | null } | { role_title: string | null }[] | null };

export async function loadPaidCalls(supabase: SupabaseClient, candidateIds: string[]): Promise<Record<string, PaidCall>> {
  const out: Record<string, PaidCall> = {};
  if (candidateIds.length === 0) return out;
  const { data } = await supabase
    .from("candidate_mandate_links")
    .select("candidate_id, call_paid_at, call_due_at, mandates(role_title)")
    .in("candidate_id", candidateIds)
    .not("call_paid_at", "is", null)
    .is("call_refunded_at", null)
    .order("call_paid_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return out;
  const { data: logs } = await supabase.from("call_log").select("candidate_id, created_at").in("candidate_id", rows.map((r) => r.candidate_id));
  const calls = (logs ?? []) as { candidate_id: string; created_at: string }[];
  const now = Date.now();
  for (const r of rows) {
    const called = calls.some((c) => c.candidate_id === r.candidate_id && new Date(c.created_at).getTime() >= new Date(r.call_paid_at).getTime());
    const state = called ? "called" : r.call_due_at && new Date(r.call_due_at).getTime() < now ? "overdue" : "waiting";
    // Rows run oldest first: an unanswered payment is never hidden behind one already handled.
    if (out[r.candidate_id] && out[r.candidate_id].state !== "called") continue;
    const m = Array.isArray(r.mandates) ? r.mandates[0] : r.mandates;
    out[r.candidate_id] = { state, role: m?.role_title ?? "a role", due: r.call_due_at };
  }
  return out;
}
