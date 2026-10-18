import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// A recruiter pressed Call. Remember it, so that when they come back the CRM can ask how it went.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { candidateId?: unknown; mandateId?: unknown };
  const uuid = /^[0-9a-f-]{36}$/i;
  if (typeof b.candidateId !== "string" || !uuid.test(b.candidateId)) return NextResponse.json({ error: "Missing candidate." }, { status: 400 });
  const mandateId = typeof b.mandateId === "string" && uuid.test(b.mandateId) ? b.mandateId : null;
  // An earlier call that was never logged is closed off, so only the latest one waits.
  await supabase.from("call_logs").delete().eq("recruiter_id", user.id).is("finished_at", null).lt("started_at", new Date(Date.now() - 6 * 3_600_000).toISOString());
  const { data, error } = await supabase.from("call_logs").insert({ candidate_id: b.candidateId, mandate_id: mandateId, recruiter_id: user.id }).select("id").single();
  if (error) return NextResponse.json({ error: "Couldn't note the call." }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
