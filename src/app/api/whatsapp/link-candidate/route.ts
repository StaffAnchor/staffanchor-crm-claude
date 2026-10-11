import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { addAlternatePhone } from "@/lib/alt-phone";
import { phoneKey } from "@/lib/whatsapp-threads";

export const runtime = "nodejs";

// A recruiter confirms that a WhatsApp chat from an unknown number is an existing candidate: the chat is
// tied to that profile and the number is saved as an alternate number, so it is recognised from now on.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const { phone, candidateId } = (await req.json().catch(() => ({}))) as { phone?: string; candidateId?: string };
  const k = phoneKey(typeof phone === "string" ? phone : null);
  if (!k || k.length !== 10 || !candidateId) return NextResponse.json({ error: "A 10-digit number and a candidate are required." }, { status: 400 });

  const { data: cand } = await admin.from("candidates").select("id, full_name").eq("id", candidateId).maybeSingle();
  if (!cand) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  // The number must not already belong to a different profile.
  const { data: owner } = await admin
    .from("candidates")
    .select("id, full_name")
    .or(`phone.ilike.%${k},alt_phones.cs.{${k}}`)
    .neq("id", candidateId)
    .limit(1);
  if (owner && owner.length > 0) return NextResponse.json({ error: `This number already belongs to ${owner[0].full_name ?? "another profile"}.` }, { status: 409 });

  const added = await addAlternatePhone(admin, candidateId, k);
  await admin.from("whatsapp_contacts").upsert({ phone_key: k, kind: "jobseeker", kind_source: "manual", candidate_id: candidateId, needs_human: false, needs_human_reason: null }, { onConflict: "phone_key" });
  await admin.from("whatsapp_messages").update({ candidate_id: candidateId }).ilike("to_phone", `%${k}`).is("candidate_id", null);
  await admin.from("audit_log").insert({ actor: user.id, action: "whatsapp_chat_linked", entity: "candidate", entity_id: candidateId, detail: { phone_key: k, alternate_added: added } });
  return NextResponse.json({ ok: true, name: cand.full_name, alternateAdded: added });
}
