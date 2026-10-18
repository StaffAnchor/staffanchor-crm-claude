import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// "I didn't actually call": forget the unfinished call.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof b.id !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await supabase.from("call_logs").delete().eq("id", b.id).eq("recruiter_id", user.id).is("finished_at", null);
  return NextResponse.json({ ok: true });
}
