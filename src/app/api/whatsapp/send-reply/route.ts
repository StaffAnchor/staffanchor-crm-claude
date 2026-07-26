import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppFreeform } from "@/lib/whatsapp";
import { logTimeSaved } from "@/lib/time-saved";

// Sends a freeform WhatsApp reply -- either an AI draft accepted as-is or
// edited by the recruiter first. Distinct from /api/whatsapp/send, which
// only fires pre-approved templates for recruiter_inbox task types; this is
// for replying inside an existing conversation, where a template doesn't fit
// what's actually being said.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { candidateId, body, wasAiDrafted } = await req.json();
  if (!candidateId || !body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "candidateId and a non-empty body are required" }, { status: 400 });
  }

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("phone")
    .eq("id", candidateId)
    .single();
  if (candidateError || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = serviceKey ? createSupabaseClient(supabaseUrl, serviceKey) : null;

  async function logMessage(fields: Record<string, unknown>) {
    if (!admin) return;
    await admin.from("whatsapp_messages").insert({
      candidate_id: candidateId,
      sent_by: user!.id,
      direction: "outbound",
      to_phone: candidate!.phone,
      body_preview: body,
      ...fields,
    });
  }

  if (!candidate.phone) {
    await logMessage({ status: "failed", error: "Candidate has no phone number on file." });
    return NextResponse.json({ ok: false, error: "Candidate has no phone number on file." }, { status: 200 });
  }

  const result = await sendWhatsAppFreeform({ to: candidate.phone, body });

  if (!result.ok) {
    await logMessage({ status: result.status === "not_configured" ? "not_configured" : "failed", error: result.error });
    return NextResponse.json({ ok: false, status: result.status, error: result.error }, { status: 200 });
  }

  await logMessage({ status: "sent", meta_message_id: result.metaMessageId });

  // Only log time saved when the recruiter actually used the AI draft
  // (as-is or edited) -- if they discarded it and wrote something totally
  // manual, this send didn't save them anything, so the caller tells us
  // which case this was.
  if (wasAiDrafted && admin) {
    await logTimeSaved(admin, {
      actionType: "ai_reply_draft",
      recruiterId: user.id,
      entityType: "candidate",
      entityId: candidateId,
    });
  }

  return NextResponse.json({ ok: true, status: "sent" });
}
