import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POOL_PRACTICE, type PoolTier } from "@/lib/talent-pool";
import { SUB_GROUPS } from "@/lib/sub-group";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

async function staff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return { error: NextResponse.json({ error: "Not permitted" }, { status: 403 }) } as const;
  return { supabase, userId: user.id } as const;
}

// What a recruiter can do to someone while their CV is open: the roles they could be added to, the groups, and their pool tier.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await staff();
  if ("error" in s) return s.error;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const [{ data: mandates }, { data: links }, { data: cand }, { data: pool }] = await Promise.all([
    s.supabase.from("mandates").select("id, role_title, client_name").eq("status", "open").eq("is_archived", false).order("created_at", { ascending: false }).limit(60),
    s.supabase.from("candidate_mandate_links").select("mandate_id, stage").eq("candidate_id", id),
    s.supabase.from("candidates").select("profile_group, profile_subgroup").eq("id", id).maybeSingle(),
    s.supabase.from("talent_pool_entries").select("tier").eq("candidate_id", id).eq("practice", POOL_PRACTICE).maybeSingle(),
  ]);
  const onRole = new Map((links ?? []).map((l) => [l.mandate_id as string, l.stage as string]));
  return NextResponse.json({
    roles: (mandates ?? []).map((m) => ({ id: m.id, title: m.role_title ?? "Role", client: m.client_name ?? "", stage: onRole.get(m.id as string) ?? null })),
    category: (cand?.profile_group as string | null) ?? null,
    subcategory: (cand?.profile_subgroup as string | null) ?? null,
    subcategories: SUB_GROUPS,
    tier: (pool?.tier as PoolTier | undefined) ?? null,
  });
}
