import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import FounderCalls, { type QueueRow, type Progress, type Settings } from "./founder-calls";

export const dynamic = "force-dynamic";

const DEFAULTS: Settings = { min_stability: 75, min_ctc: 20, per_day: 4, per_week: 20 };

export default async function FounderCallsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/candidates");

  const { data: saved } = await supabase.from("founder_call_settings").select("min_stability, min_ctc, per_day, per_week").eq("user_id", user.id).maybeSingle();
  const settings: Settings = saved ? { min_stability: saved.min_stability, min_ctc: Number(saved.min_ctc), per_day: saved.per_day, per_week: saved.per_week } : DEFAULTS;

  const [q, prog] = await Promise.all([
    supabase.rpc("founder_call_queue", { p_min_stab: settings.min_stability, p_min_ctc: settings.min_ctc, p_limit: Math.max(settings.per_week * 2, 40) }),
    supabase.rpc("founder_call_progress"),
  ]);

  return (
    <div>
      <CandidatesSubNav />
      <FounderCalls rows={(q.data ?? []) as QueueRow[]} progress={(prog.data ?? { spoke_today: 0, tried_today: 0, spoke_week: 0 }) as Progress} settings={settings} />
    </div>
  );
}
