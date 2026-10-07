import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppFreeform } from "@/lib/whatsapp";
import { WINDOW_MS, phoneKey } from "@/lib/whatsapp-threads";

// A recruiter replies to a WhatsApp conversation by phone number. Works for people
// who are not in the candidate database yet. WhatsApp only allows free-form
// messages for 24 hours after the other person last wrote, so we check that first
// and say plainly when the window has closed.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { phone, body, candidateId } = await req.json();
  const key = phoneKey(typeof phone === "string" ? phone : null);
  if (!key || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "A phone number and a message are required." }, { status: 400 });
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: recentInbound } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("direction", "inbound")
    .ilike("to_phone", `%${key}`)
    .gte("created_at", since)
    .limit(1);
  if (!recentInbound || recentInbound.length === 0) {
    return NextResponse.json(
      { ok: false, error: "The 24-hour reply window has closed. They need to message you again, or you can send an approved template." },
      { status: 409 }
    );
  }

  const result = await sendWhatsAppFreeform({ to: key, body: body.trim() });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
    await admin.from("whatsapp_messages").insert({
      candidate_id: typeof candidateId === "string" ? candidateId : null,
      sent_by: user.id,
      direction: "outbound",
      to_phone: key,
      body_preview: body.trim(),
      status: result.ok ? "sent" : result.status === "not_configured" ? "not_configured" : "failed",
      meta_message_id: result.ok ? result.metaMessageId : null,
      error: result.ok ? null : result.error,
    });
  }

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  return NextResponse.json({ ok: true });
}
