import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POOL_PRACTICE, POOL_TAGS, isPoolTier, reasonRequired } from "@/lib/talent-pool";

export const runtime = "nodejs";

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

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// Add someone to the pool, change their tier, or update the reason. Any recruiter can; every change is logged.
export async function POST(req: Request) {
  const s = await staff();
  if ("error" in s) return s.error;
  const body = (await req.json().catch(() => ({}))) as { candidateId?: unknown; tier?: unknown; reason?: unknown; tags?: unknown };
  if (!isId(body.candidateId)) return NextResponse.json({ error: "Missing candidate." }, { status: 400 });
  if (!isPoolTier(body.tier)) return NextResponse.json({ error: "Pick a tier." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 600) : "";
  if (reasonRequired(body.tier) && reason.length < 5) return NextResponse.json({ error: "Add a short reason (a few words on why they belong here)." }, { status: 400 });
  const allowed = new Set<string>(POOL_TAGS);
  const tags = (Array.isArray(body.tags) ? body.tags : []).filter((t): t is string => typeof t === "string" && allowed.has(t)).slice(0, 10);

  const { data: before } = await s.supabase.from("talent_pool_entries").select("id, tier, reason").eq("candidate_id", body.candidateId).eq("practice", POOL_PRACTICE).maybeSingle();
  const now = new Date().toISOString();
  const { error } = await s.supabase.from("talent_pool_entries").upsert(
    {
      candidate_id: body.candidateId,
      practice: POOL_PRACTICE,
      tier: body.tier,
      reason: reason || null,
      tags,
      marked_by: before ? undefined : s.userId,
      updated_at: now,
      last_reviewed_at: now,
    },
    { onConflict: "candidate_id,practice" }
  );
  if (error) return NextResponse.json({ error: "Couldn't save. Please try again." }, { status: 500 });

  await s.supabase.from("talent_pool_events").insert({
    candidate_id: body.candidateId,
    practice: POOL_PRACTICE,
    action: !before ? "added" : before.tier !== body.tier ? "tier_changed" : "note_updated",
    from_tier: before?.tier ?? null,
    to_tier: body.tier,
    note: reason || null,
    actor_id: s.userId,
  });
  return NextResponse.json({ ok: true });
}

// Take someone out of the pool. Kept in the log with who and when.
export async function DELETE(req: Request) {
  const s = await staff();
  if ("error" in s) return s.error;
  const body = (await req.json().catch(() => ({}))) as { candidateId?: unknown };
  if (!isId(body.candidateId)) return NextResponse.json({ error: "Missing candidate." }, { status: 400 });
  const { data: before } = await s.supabase.from("talent_pool_entries").select("tier").eq("candidate_id", body.candidateId).eq("practice", POOL_PRACTICE).maybeSingle();
  if (!before) return NextResponse.json({ ok: true });
  const { error } = await s.supabase.from("talent_pool_entries").delete().eq("candidate_id", body.candidateId).eq("practice", POOL_PRACTICE);
  if (error) return NextResponse.json({ error: "Couldn't remove. Please try again." }, { status: 500 });
  await s.supabase.from("talent_pool_events").insert({ candidate_id: body.candidateId, practice: POOL_PRACTICE, action: "removed", from_tier: before.tier, actor_id: s.userId });
  return NextResponse.json({ ok: true });
}
