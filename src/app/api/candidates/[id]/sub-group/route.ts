import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUB_GROUPS } from "@/lib/sub-group";

export const runtime = "nodejs";

// A person corrects the group and sub-group. Both are then locked, so the nightly sorting never moves them back.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { group?: unknown; subGroup?: unknown };
  const group = typeof b.group === "string" ? b.group : "";
  const sub = typeof b.subGroup === "string" ? b.subGroup : "";
  if (!(group in SUB_GROUPS) || !SUB_GROUPS[group].includes(sub)) return NextResponse.json({ error: "Choose a group and sub-group from the list." }, { status: 400 });
  const { error } = await supabase.from("candidates").update({ profile_group: group, profile_group_locked: true, profile_group_needs_review: false, sub_group: sub, sub_group_locked: true }).eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
