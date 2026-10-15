import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate, templateNameForTaskType, oneLine } from "@/lib/whatsapp";
import { supabaseStore } from "@/lib/whatsapp-bot/store";
import { phoneKey } from "@/lib/whatsapp-threads";
import { renderInterviewMessage, renderOfferMessage } from "@/lib/whatsapp-template-text";

export const runtime = "nodejs";

const KINDS = {
  interview: { task: "TRIGGER_INTERVIEW_COORDINATION", label: "interview request" },
  offer: { task: "FOLLOW_UP_ON_OFFER", label: "offer follow-up" },
} as const;

// One-click template message for a candidate on a role: the interview request or the offer follow-up.
// It never names the client. A person presses the button; the same message is not sent twice in 2 days.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { candidateId?: unknown; mandateId?: unknown; kind?: unknown; preview?: unknown };
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
  const mandateId = typeof body.mandateId === "string" ? body.mandateId : "";
  const kind = body.kind === "interview" || body.kind === "offer" ? body.kind : null;
  if (!candidateId || !mandateId || !kind) return NextResponse.json({ error: "candidateId, mandateId and kind are required" }, { status: 400 });

  const templateName = templateNameForTaskType(KINDS[kind].task);
  if (!templateName) return NextResponse.json({ ok: false, error: `The ${KINDS[kind].label} template isn't set up yet.` }, { status: 200 });

  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const { data: cand } = await supabase.from("candidates").select("id, full_name, phone, phone_hold").eq("id", candidateId).maybeSingle();
  const { data: mandate } = await supabase.from("mandates").select("role_title").eq("id", mandateId).maybeSingle();
  if (!cand || !mandate) return NextResponse.json({ ok: false, error: "Candidate or role not found." }, { status: 200 });

  if (cand.phone_hold) return NextResponse.json({ ok: false, error: "This number is on hold until the candidate confirms it." }, { status: 200 });
  const key = phoneKey(cand.phone as string | null);
  if (!key || key.length !== 10) return NextResponse.json({ ok: false, error: "No usable mobile number on file." }, { status: 200 });
  const store = supabaseStore(admin);
  const contact = await store.getContact(key);
  if (contact?.opted_out) return NextResponse.json({ ok: false, error: "They asked not to get automatic messages." }, { status: 200 });

  const { data: recent } = await admin
    .from("whatsapp_messages")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("template_name", templateName)
    .eq("status", "sent")
    .gte("created_at", new Date(new Date().getTime() - 2 * 86_400_000).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return NextResponse.json({ ok: false, error: "This message was already sent in the last 2 days." }, { status: 200 });

  const first = oneLine(((cand.full_name as string | null) ?? "").trim().split(/\s+/)[0] || "there");
  const role = oneLine(String(mandate.role_title ?? "the role"));
  if (body.preview === true) {
    return NextResponse.json({
      ok: true,
      preview: {
        route: "template",
        messages: [kind === "interview" ? renderInterviewMessage(first, role) : renderOfferMessage(first, role)],
        items: [],
        note: `This goes as Meta's approved ${KINDS[kind].label} template, sent from StaffAnchor's number. The wording is fixed by Meta; only the name and role change. Meta charges per message.`,
      },
    });
  }

  const res = await sendWhatsAppTemplate({ to: key, templateName, bodyParams: [first, role] });
  await store.logMessage({
    candidate_id: candidateId,
    direction: "outbound",
    to_phone: key,
    body_preview: kind === "interview" ? renderInterviewMessage(first, role) : renderOfferMessage(first, role),
    status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
    template_name: templateName,
    meta_message_id: res.ok ? res.metaMessageId : null,
    error: res.ok ? null : res.error,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: `WhatsApp didn't send it: ${res.error}` }, { status: 200 });

  if (!contact) await store.createContact(key);
  await store.updateContact(key, { kind: "jobseeker", kind_source: "manual", candidate_id: candidateId });
  await admin.from("audit_log").insert({ actor: user.id, action: `whatsapp_${kind}_template`, entity: "candidate", entity_id: candidateId, detail: { mandateId, template: templateName } });
  return NextResponse.json({ ok: true });
}
