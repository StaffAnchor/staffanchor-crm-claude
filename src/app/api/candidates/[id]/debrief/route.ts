import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { runDebrief } from "@/lib/debrief";
import { generateBrief } from "@/lib/candidate-brief";
import { isPoolTier } from "@/lib/talent-pool";
import { queueProactiveMatchesForCandidate } from "@/lib/proactive-match";

export const runtime = "nodejs";
export const maxDuration = 60;

// After a call: the recruiter writes a rough note; the system records everything it implies, then (after the
// response is sent) rewrites the candidate's brief and queues the person against open roles.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing candidate." }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdmin(url, key, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { note?: unknown; tier?: unknown };
  const note = typeof body.note === "string" ? body.note : "";
  const tier = isPoolTier(body.tier) ? body.tier : null;

  const r = await runDebrief(admin, { candidateId: id, authorId: user.id, note, tier });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200 });

  after(async () => {
    await generateBrief(admin, id);
    if (r.applied.tier === "top" || r.applied.tier === "strong") await queueProactiveMatchesForCandidate(id, admin).catch(() => {});
  });

  return NextResponse.json({ ok: true, debrief: r.debrief, applied: r.applied });
}
