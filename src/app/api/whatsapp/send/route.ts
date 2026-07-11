import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate, templateNameForTaskType } from "@/lib/whatsapp";

// Triggered by the Priority Actions Inbox's "Send Update" action (Phase 2,
// Task 2). Runs under the caller's own session so the existing
// recruiter_inbox RLS (recruiter sees only their own items, or admin sees
// all) governs which items can be actioned -- no bespoke authorization
// logic needed here.
//
// Always logs an attempt to whatsapp_messages, even when WhatsApp isn't
// configured yet or no template is mapped -- so there's a visible audit
// trail from day one, and nothing breaks before real Meta credentials
// exist.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { inboxItemId } = await req.json();
  if (!inboxItemId) {
    return NextResponse.json({ error: "inboxItemId is required" }, { status: 400 });
  }

  const { data: item, error: itemError } = await supabase
    .from("recruiter_inbox")
    .select("id, candidate_id, mandate_id, task_type, title")
    .eq("id", inboxItemId)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: "Inbox item not found" }, { status: 404 });
  }
  if (!item.candidate_id) {
    return NextResponse.json({ error: "This item has no linked candidate" }, { status: 400 });
  }

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("full_name, phone")
    .eq("id", item.candidate_id)
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  let mandateRoleTitle: string | null = null;
  if (item.mandate_id) {
    const { data: mandate } = await supabase
      .from("mandates")
      .select("role_title")
      .eq("id", item.mandate_id)
      .single();
    mandateRoleTitle = mandate?.role_title ?? null;
  }

  const templateName = templateNameForTaskType(item.task_type);

  // Logging uses a service-role client so the audit row is written even on
  // the not-configured/no-template path (writing whatsapp_messages isn't
  // otherwise blocked for staff, but this keeps logging consistent
  // regardless of which branch below runs).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = serviceKey ? createSupabaseClient(supabaseUrl, serviceKey) : null;

  async function logAttempt(fields: Record<string, unknown>) {
    if (!admin) return;
    await admin.from("whatsapp_messages").insert({
      candidate_id: item!.candidate_id,
      inbox_item_id: item!.id,
      sent_by: user!.id,
      direction: "outbound",
      template_name: templateName,
      to_phone: candidate!.phone,
      body_preview: item!.title,
      ...fields,
    });
  }

  if (!templateName) {
    await logAttempt({
      status: "not_configured",
      error: "No WhatsApp template mapped for this task type yet.",
    });
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        error:
          "WhatsApp updates aren't set up yet for this task type -- once Meta credentials and an approved template are added, this will send automatically.",
      },
      { status: 200 }
    );
  }

  if (!candidate.phone) {
    await logAttempt({ status: "failed", error: "Candidate has no phone number on file." });
    return NextResponse.json(
      { ok: false, status: "failed", error: "Candidate has no phone number on file." },
      { status: 200 }
    );
  }

  const result = await sendWhatsAppTemplate({
    to: candidate.phone,
    templateName,
    bodyParams: [candidate.full_name ?? "there", mandateRoleTitle ?? "the role"],
  });

  if (!result.ok) {
    await logAttempt({ status: result.status === "not_configured" ? "not_configured" : "failed", error: result.error });
    return NextResponse.json({ ok: false, status: result.status, error: result.error }, { status: 200 });
  }

  await logAttempt({ status: "sent", meta_message_id: result.metaMessageId });

  return NextResponse.json({ ok: true, status: "sent" });
}
