import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppFreeform } from "@/lib/whatsapp";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { whatsappEmailLine } from "@/lib/whatsapp-entry";
import { missingKeyDetails } from "@/lib/key-details";
import { startOnboarding } from "@/lib/whatsapp-bot/flow";
import { candidatePrefill } from "@/lib/whatsapp-bot/engine";
import { supabaseStore, type CandidateLite } from "@/lib/whatsapp-bot/store";
import { WINDOW_MS, phoneKey } from "@/lib/whatsapp-threads";

export const runtime = "nodejs";

// "Ask for missing details": a recruiter asks one candidate for exactly what their profile lacks.
//  - Inside WhatsApp's 24-hour window: the assistant asks the missing questions in the chat and
//    fills the answers into the profile (blanks only).
//  - Window closed (or no WhatsApp number): an email lists what is missing and links to the profile form.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { candidateId } = (await req.json().catch(() => ({}))) as { candidateId?: string };
  if (!candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });

  const store = supabaseStore(admin);
  const cand = await store.getCandidate(candidateId);
  if (!cand) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  const missing = missingKeyDetails({ ...cand });
  if (missing.length === 0) return NextResponse.json({ ok: false, error: "Nothing is missing from this profile." }, { status: 200 });

  const key = phoneKey(cand.phone);
  const nowMs = new Date().getTime();

  // Is the free-message window open?
  let windowOpen = false;
  let contact = null as Awaited<ReturnType<typeof store.getContact>>;
  if (key && key.length === 10) {
    contact = await store.getContact(key);
    if (contact?.opted_out) return NextResponse.json({ ok: false, error: "They asked not to get automatic messages." }, { status: 200 });
    const { data: recent } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("direction", "inbound")
      .ilike("to_phone", `%${key}`)
      .gte("created_at", new Date(nowMs - WINDOW_MS).toISOString())
      .limit(1);
    windowOpen = !!recent && recent.length > 0;
  }

  if (windowOpen && key) {
    const st = contact?.bot_state as { status?: string; startedAt?: string | null } | undefined;
    if (st?.status === "active" && st.startedAt && nowMs - new Date(st.startedAt).getTime() < WINDOW_MS) {
      return NextResponse.json({ ok: false, error: "The assistant is already asking them. Wait for their reply." }, { status: 200 });
    }
    const started = startOnboarding({ prefill: candidatePrefill(cand), existingCandidateId: cand.id, hasResume: !!cand.resume_file_url, nowIso: new Date(nowMs).toISOString(), recruiterAsked: true });
    started.state.candidateId = cand.id;
    for (const text of started.replies) {
      const res = await sendWhatsAppFreeform({ to: key, body: text });
      await store.logMessage({
        candidate_id: cand.id,
        direction: "outbound",
        to_phone: key,
        body_preview: text,
        status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
        template_name: "bot:onboarding",
        meta_message_id: res.ok ? res.metaMessageId : null,
        error: res.ok ? null : res.error,
      });
      if (!res.ok) return NextResponse.json({ ok: false, error: `WhatsApp didn't send it: ${res.error}` }, { status: 200 });
    }
    if (!contact) contact = await store.createContact(key);
    await store.updateContact(key, { kind: "jobseeker", kind_source: "manual", candidate_id: cand.id, bot_paused: false, needs_human: false, needs_human_reason: null, archived_at: null, bot_state: started.state });
    await admin.from("audit_log").insert({ actor: user.id, action: "missing_details_asked", entity: "candidate", entity_id: cand.id, detail: { via: "whatsapp", missing: missing.map((m) => m.key) } });
    return NextResponse.json({ ok: true, via: "whatsapp", count: missing.length });
  }

  // The window is closed: email instead.
  return await emailFallback(admin, user.id, cand, missing.map((m) => m.ask), missing.map((m) => m.key));
}

async function emailFallback(admin: SupabaseClient, actor: string, cand: CandidateLite, asks: string[], keys: string[]) {
  const reason = "The 24-hour WhatsApp window is closed";
  if (!cand.email || cand.email.endsWith(".invalid")) {
    return NextResponse.json({ ok: false, error: `${reason} and there's no email on file. Message them from your phone, or ask them to message the StaffAnchor number.` }, { status: 200 });
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ ok: false, error: `${reason}, and email sending isn't configured.` }, { status: 200 });
  }
  const list = asks.length > 1 ? `${asks.slice(0, -1).join(", ")} and ${asks[asks.length - 1]}` : asks[0];
  const registerUrl = `https://jobs.staffanchor.com/register?name=${encodeURIComponent(cand.full_name ?? "")}&email=${encodeURIComponent(cand.email)}&ref=${cand.id}`;
  const name = (cand.full_name ?? "").trim().split(/\s+/)[0] || "there";
  try {
    await sendEmail({
      to: cand.email,
      subject: "A few details to complete your StaffAnchor profile",
      text: `Hi ${name},\n\nTo match you with the right roles, we still need ${list}. It takes about a minute: ${registerUrl}\n\nYou can also reply to this email.\n\nThanks,\nStaffAnchor Team`,
      html: renderEmailShell({
        preheader: "A minute to complete your profile so we can match you to the right roles.",
        bodyHtml: `<p>Hi ${name},</p><p>To match you with the right roles, we still need <strong>${list}</strong>. It takes about a minute.</p><p><a href="${registerUrl}">Complete your profile</a></p><p>Thanks,<br/>StaffAnchor Team</p>${whatsappEmailLine("Hi StaffAnchor, I got your email about completing my profile. Could you help?").html}`,
      }),
    });
    await admin.from("audit_log").insert({ actor, action: "missing_details_asked", entity: "candidate", entity_id: cand.id, detail: { via: "email", to: cand.email, missing: keys } });
    return NextResponse.json({ ok: true, via: "email", count: keys.length, note: reason });
  } catch (err) {
    console.error("Missing-details email failed", err);
    return NextResponse.json({ ok: false, error: "Couldn't send the email. Please try again." }, { status: 200 });
  }
}
