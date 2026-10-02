import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMine, loadTaskBoard } from "@/lib/task-packets";

// Small count for the Tasks tab badge: how many of my packets are late or
// due soon (the backlog is not counted, so the badge stays meaningful).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const board = await loadTaskBoard(supabase);
  const mine = board.packets.filter((p) => isMine(p, user.id) && !p.backlog);
  return NextResponse.json({
    late: mine.filter((p) => p.state === "overdue").length,
    due: mine.filter((p) => p.state === "due").length,
  });
}
