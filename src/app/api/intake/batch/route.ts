import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Today's batch: the next people worth asking for their missing details, best first. The list is only read here; the
// messages are reviewed and sent through the bulk ask, by a person.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await supabase.rpc("intake_batch", { p_limit: 20 });
  if (error) return NextResponse.json({ error: "Couldn't prepare the batch." }, { status: 500 });
  const rows = (data ?? []) as { id: string; full_name: string | null; readiness_score: number | null; fits_open_role: boolean; sub_group: string | null }[];
  return NextResponse.json({ ok: true, people: rows.map((r) => ({ id: r.id, name: r.full_name ?? "Unnamed", fits: r.fits_open_role, subGroup: r.sub_group, score: r.readiness_score })) });
}
