import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTaskBoard } from "@/lib/task-packets";
import TasksBoard from "./tasks-board";

export const dynamic = "force-dynamic";

// Start of today in India time, as an ISO instant.
function istStartOfToday(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${f}T00:00:00+05:30`).toISOString();
}

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const board = await loadTaskBoard(supabase);
  const { count } = await supabase.from("recruiter_inbox").select("id", { count: "exact", head: true }).eq("status", "done").gte("resolved_at", istStartOfToday());

  return <TasksBoard board={{ ...board, doneToday: count ?? 0 }} userId={user.id} />;
}
