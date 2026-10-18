import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Merges one or more profiles into the one to keep. The database function does the work and is admin-only.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { keep?: unknown; drop?: unknown };
  const uuid = /^[0-9a-f-]{36}$/i;
  const keep = typeof b.keep === "string" && uuid.test(b.keep) ? b.keep : null;
  const drops = (Array.isArray(b.drop) ? b.drop : []).filter((x): x is string => typeof x === "string" && uuid.test(x) && x !== keep).slice(0, 10);
  if (!keep || drops.length === 0) return NextResponse.json({ error: "Choose a profile to keep and at least one to merge." }, { status: 400 });
  for (const d of drops) {
    const { error } = await supabase.rpc("merge_candidates", { p_keep: keep, p_drop: d });
    if (error) return NextResponse.json({ error: /not permitted/.test(error.message) ? "Only an admin can merge profiles." : "That merge didn't work. Nothing further was merged." }, { status: error.message.includes("not permitted") ? 403 : 500 });
  }
  return NextResponse.json({ ok: true, merged: drops.length });
}
