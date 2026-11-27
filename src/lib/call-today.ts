import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPriorityCalls } from "@/lib/priority-calls";

// "Call today" on the People page: everything owed first (paid calls, call-backs, people who said yes, urgent roles),
// then topped up to a day's worth with the strongest people from the Calls desk's own list. Each one says why.
export const CALL_TARGET = 15;

export async function loadCallToday(supabase: SupabaseClient, memoKey?: string): Promise<{ ids: string[]; why: Record<string, string> }> {
  const priority = await loadPriorityCalls(supabase, memoKey);
  const why: Record<string, string> = {};
  const ids: string[] = [];
  for (const p of priority.people) {
    if (why[p.id]) continue;
    ids.push(p.id);
    why[p.id] =
      p.reason === "paid_call"
        ? "Paid for a call"
        : p.reason === "call_back"
          ? "Call back due"
          : p.reason === "interested"
            ? `Said yes${p.interested_role ? ` to ${p.interested_role}` : " to a role"}`
            : `Urgent role${p.urgent_role ? `: ${p.urgent_role.title}` : ""}`;
  }
  if (ids.length < CALL_TARGET) {
    const { data } = await supabase.rpc("calls_today", { p_limit: 100, p_focus: "mixed" });
    for (const r of (data ?? []) as { id: string; reason: string; last_outcome: string | null }[]) {
      if (ids.length >= CALL_TARGET) break;
      if (why[r.id] || (r.reason !== "confirm_open" && r.reason !== "worth_a_call")) continue;
      ids.push(r.id);
      why[r.id] = r.last_outcome ? "Strong profile, try again" : "Strong profile, not called yet";
    }
  }
  return { ids, why };
}
