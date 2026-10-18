import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Publish or unpublish one salary page (a role in a city). Admin only; the page shows only aggregates.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { cluster?: unknown; metro?: unknown; published?: unknown };
  if (typeof b.cluster !== "string" || typeof b.metro !== "string" || typeof b.published !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { error } = await supabase.from("benchmark_pages").upsert({ cluster_slug: b.cluster, metro: b.metro, published: b.published, updated_at: new Date().toISOString() }, { onConflict: "cluster_slug,metro" });
  if (error) return NextResponse.json({ error: "Only an admin can do that." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
