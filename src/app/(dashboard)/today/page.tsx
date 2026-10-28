import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTodayDesk } from "@/lib/today-desk";
import { loadFocus } from "@/lib/today-focus";
import { loadClientReplies } from "@/lib/client-replies";
import { adminDb } from "@/lib/pro-sessions/core";
import { loadWaiting } from "@/lib/waiting-queue";
import TodayView from "./today-view";

const TREND_DAYS = 14;
const IST_DAY = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

const trendSince = () => new Date(Date.now() - (TREND_DAYS + 1) * 86_400_000).toISOString();

// Counts per day, oldest first, for the last TREND_DAYS days (India time). Missing days are zero.
function perDay(rows: { created_at: string }[] | null): number[] {
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(IST_DAY(r.created_at), (counts.get(IST_DAY(r.created_at)) ?? 0) + 1);
  const out: number[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) out.push(counts.get(IST_DAY(new Date(Date.now() - i * 86_400_000).toISOString())) ?? 0);
  return out;
}

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
  const replies = await loadClientReplies(supabase).catch(() => ({ items: [], unseen: 0 }));
  const admin = adminDb();
  const waiting = admin ? await loadWaiting(admin).catch(() => []) : [];
  const since = trendSince();
  const [{ data: newProfiles }, { data: addedToRoles }] = admin
    ? await Promise.all([
        admin.from("candidates").select("created_at").gte("created_at", since).limit(5000),
        admin.from("candidate_mandate_links").select("created_at").gte("created_at", since).limit(5000),
      ])
    : [{ data: null }, { data: null }];
  const trends = { newProfiles: perDay(newProfiles), addedToRoles: perDay(addedToRoles) };
  return <TodayView desk={desk} focus={focus} waiting={waiting} trends={trends} replies={replies} />;
}
