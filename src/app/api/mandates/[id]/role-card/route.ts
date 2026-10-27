import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { cleanCard, generateRoleCard } from "@/lib/role-card";

export const runtime = "nodejs";
export const maxDuration = 60;

async function staff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return { error: NextResponse.json({ error: "Not permitted" }, { status: 403 }) } as const;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: NextResponse.json({ error: "Not configured" }, { status: 503 }) } as const;
  return { user, admin: createAdmin(url, key, { auth: { persistSession: false } }) } as const;
}

// Write (or rewrite) the role card from the mandate, with AI.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await staff();
  if ("error" in s) return s.error;
  const { id } = await ctx.params;
  const r = await generateRoleCard(s.admin, id);
  return NextResponse.json(r.ok ? { ok: true, card: r.card } : { ok: false, error: r.error });
}

// Save the recruiter's edits to the card.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await staff();
  if ("error" in s) return s.error;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { card?: unknown };
  const [{ data: cl }, { data: wl }] = await Promise.all([s.admin.from("role_clusters").select("slug"), s.admin.from("selling_worlds").select("slug")]);
  const card = cleanCard(body.card, new Set((cl ?? []).map((c: { slug: string }) => c.slug)), new Set((wl ?? []).map((w: { slug: string }) => w.slug)));
  if (!card) return NextResponse.json({ ok: false, error: "That card isn't valid." }, { status: 400 });
  await s.admin.from("mandate_role_cards").upsert({ mandate_id: id, card, confirmed: true, updated_by: s.user.id, updated_at: new Date().toISOString() }, { onConflict: "mandate_id" });
  // Role type and level live on the mandate, so a change here is a change there.
  await s.admin.from("mandates").update({ role_cluster: card.cluster, ...(card.level !== "any" ? { seniority_band: card.level } : {}) }).eq("id", id);
  return NextResponse.json({ ok: true, card });
}
