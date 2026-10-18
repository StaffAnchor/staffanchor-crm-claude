import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// "These are different people": the group stops appearing.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { key?: unknown };
  const key = typeof b.key === "string" && /^(phone|email):.{3,200}$/.test(b.key) ? b.key : null;
  if (!key) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { error } = await supabase.from("duplicate_dismissals").upsert({ group_key: key, dismissed_by: user.id }, { onConflict: "group_key" });
  if (error) return NextResponse.json({ error: "Only an admin can do that." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
