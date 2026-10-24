import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTodayDesk } from "@/lib/today-desk";
import { loadFocus } from "@/lib/today-focus";
import { adminDb } from "@/lib/pro-sessions/core";
import { loadWaiting } from "@/lib/waiting-queue";
import TodayView from "./today-view";

export const dynamic = "force-dynamic";

// Home screen for staff: a handful of decisions, the one task to do next,
// and a one-glance health table for every open role. The old task list
// (My Desk) is still reachable as "All tasks".
export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
  const name = profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : null);

  const desk = await loadTodayDesk(supabase, user.id, name);
  const focus = await loadFocus(supabase, user.id, desk).catch(() => ({ cards: [], feesInPlay: null }));
  const admin = adminDb();
  const waiting = admin ? await loadWaiting(admin).catch(() => []) : [];
  return <TodayView desk={desk} focus={focus} waiting={waiting} />;
}
