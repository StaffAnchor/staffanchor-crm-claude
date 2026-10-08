import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppFreeform } from "@/lib/whatsapp";
import { handleInbound, type Io } from "@/lib/whatsapp-bot/engine";
import { supabaseStore } from "@/lib/whatsapp-bot/store";

// Reads the assistant switches. Off unless WHATSAPP_BOT=true; WHATSAPP_BOT_ALLOWLIST (comma-separated
// numbers) limits it to those people, which is how it is tested on your own phone first.
// The assistant can read a CV with AI before replying, which takes a while.
export const maxDuration = 60;

const lastTen = (list: string | undefined) => (list ? list.split(",").map((n) => n.replace(/\D/g, "").slice(-10)).filter(Boolean) : null);

const botEnv = () => ({
  enabled: process.env.WHATSAPP_BOT === "true",
  allowlist: lastTen(process.env.WHATSAPP_BOT_ALLOWLIST),
  staff: lastTen(process.env.WHATSAPP_STAFF_NUMBERS) ?? [],
  nowMs: new Date().getTime(),
});

const botIo: Io = {
  async send(to, body) {
    const r = await sendWhatsAppFreeform({ to, body });
    if (r.ok) return { ok: true, id: r.metaMessageId ?? "" };
    return { ok: false, error: r.error ?? "send failed", notConfigured: r.status === "not_configured" };
  },
  async downloadMedia(mediaId) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) return null;
    try {
      const meta = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!meta.ok) return null;
      const info = (await meta.json()) as { url?: string; mime_type?: string };
      if (!info.url) return null;
      const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
      if (!file.ok) return null;
      return { bytes: new Uint8Array(await file.arrayBuffer()), mime: info.mime_type ?? null };
    } catch {
      return null;
    }
  },
};

// Meta WhatsApp Cloud API webhook (Phase 2, Task 2). Two jobs:
//  - GET: the one-time verification handshake Meta requires when you
//    register this URL as the app's webhook callback.
//  - POST: ongoing delivery-status updates (sent/delivered/read/failed)
//    for messages sent via /api/whatsapp/send, and inbound messages from
//    candidates replying on WhatsApp. Both just update/insert rows in
//    whatsapp_messages -- no auto-reply logic here by design; this is the
//    receiving half of the pipe, not a bot.
//
// Exempted from the staff-auth middleware (see
// src/lib/supabase/middleware.ts) since Meta calls this with no cookie
// session at all.

export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (!verifyToken) {
    return NextResponse.json(
      { error: "WHATSAPP_VERIFY_TOKEN not configured on the server yet." },
      { status: 503 }
    );
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    // Meta expects the raw challenge string back, not JSON.
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: true }); // Meta retries on non-2xx; ack and move on.
  }

  if (!serviceKey) {
    // Nothing to persist to without a service-role key, but still ack so
    // Meta doesn't treat this as a failed delivery and keep retrying.
    return NextResponse.json({ ok: true, note: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  try {
    const entries = payload?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        // Delivery/read/failed status updates for messages we sent.
        for (const status of value.statuses ?? []) {
          const metaMessageId = status?.id;
          if (!metaMessageId) continue;
          const known = ["sent", "delivered", "read", "failed"];
          if (!known.includes(status?.status)) continue;
          // Keep Meta's error code with its title: the code (for example 131049,
          // "not delivered to maintain healthy ecosystem engagement") is what
          // says why a message did not arrive.
          const firstError = status?.errors?.[0];
          const errorText = firstError ? `${firstError.code ?? ""} ${firstError.title ?? firstError.message ?? ""}`.trim() : null;

          const { data: updated } = await admin
            .from("whatsapp_messages")
            .update({
              status: status.status, // "sent" | "delivered" | "read" | "failed"
              error: errorText,
              raw_payload: status,
            })
            .eq("meta_message_id", metaMessageId)
            .select("id");

          // A message sent from outside the CRM (a test from the Graph API
          // Explorer, or another tool) has no row yet. Record its result anyway
          // so a delivery problem is never invisible.
          if (!updated || updated.length === 0) {
            const recipient: string | null = status?.recipient_id ?? null;
            let candidateId: string | null = null;
            if (recipient) {
              const { data: match } = await admin.from("candidates").select("id").ilike("phone", `%${recipient.slice(-10)}`).limit(1).maybeSingle();
              candidateId = match?.id ?? null;
            }
            await admin.from("whatsapp_messages").insert({
              candidate_id: candidateId,
              direction: "outbound",
              to_phone: recipient,
              body_preview: "Sent outside the CRM",
              status: status.status,
              meta_message_id: metaMessageId,
              error: errorText,
              raw_payload: status,
            });
          }
        }

        // Inbound messages from candidates replying on WhatsApp.
        for (const message of value.messages ?? []) {
          const fromPhone = message?.from ?? null;
          const bodyText = message?.text?.body ?? null;

          let candidateId: string | null = null;
          if (fromPhone) {
            const { data: match } = await admin
              .from("candidates")
              .select("id")
              .ilike("phone", `%${fromPhone.slice(-10)}`) // match on last-10-digit local number
              .limit(1)
              .maybeSingle();
            candidateId = match?.id ?? null;
          }

          // Meta retries a delivery it thinks failed, so never store the same message twice.
          const incomingId: string | null = message?.id ?? null;
          if (incomingId) {
            const { data: already } = await admin.from("whatsapp_messages").select("id").eq("meta_message_id", incomingId).limit(1);
            if (already && already.length > 0) continue;
          }

          // A tapped quick-reply button arrives as an interactive/button reply, not text.
          const caption: string | null = message?.image?.caption ?? message?.document?.caption ?? message?.video?.caption ?? null;
          const shownText: string | null =
            bodyText ??
            message?.button?.text ??
            message?.interactive?.button_reply?.title ??
            message?.interactive?.list_reply?.title ??
            (message?.type === "document"
              ? `Document: ${message?.document?.filename ?? "file"}${caption ? ` (${caption})` : ""}`
              : message?.type === "image"
                ? `Photo${caption ? `: ${caption}` : ""}`
                : message?.type === "audio"
                  ? "Voice note"
                  : message?.type === "video"
                    ? "Video"
                    : null);

          await admin.from("whatsapp_messages").insert({
            candidate_id: candidateId,
            direction: "inbound",
            to_phone: fromPhone,
            body_preview: shownText,
            status: "delivered",
            meta_message_id: incomingId,
            raw_payload: message,
          });

          // The assistant: sorts the chat (jobseeker / employer / referrer / other) and, for
          // jobseekers only, collects a profile. Employers are never asked profile questions.
          const bot = botEnv();
          if (fromPhone) {
            try {
              await handleInbound(
                bot,
                supabaseStore(admin),
                botIo,
                {
                  phone: fromPhone,
                  id: incomingId ?? `nomid-${bot.nowMs}`,
                  type: message?.type ?? "text",
                  text: message?.type === "document" || message?.type === "image" ? (caption ?? null) : shownText,
                  mediaId: message?.document?.id ?? message?.image?.id ?? null,
                  mimeType: message?.document?.mime_type ?? message?.image?.mime_type ?? null,
                  filename: message?.document?.filename ?? null,
                },
              );
            } catch (err) {
              console.error("WhatsApp assistant failed", err);
            }
            if (bot.enabled) continue;
          }

          // Optional first acknowledgement, only when switched on (WHATSAPP_AUTO_ACK=true).
          // One per 24 hours per person, sent inside the window the person just opened,
          // so it is free and not a template.
          if (process.env.WHATSAPP_AUTO_ACK === "true" && fromPhone) {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentOut } = await admin
              .from("whatsapp_messages")
              .select("id")
              .eq("direction", "outbound")
              .ilike("to_phone", `%${fromPhone.slice(-10)}`)
              .gte("created_at", since)
              .limit(1);
            if (!recentOut || recentOut.length === 0) {
              let first = "there";
              if (candidateId) {
                const { data: cand } = await admin.from("candidates").select("full_name").eq("id", candidateId).maybeSingle();
                first = (cand?.full_name as string | undefined)?.trim().split(/\s+/)[0] || "there";
              }
              const ackBody = `Hi ${first}, thanks for messaging StaffAnchor. A recruiter will reply shortly, usually within one working day. Meanwhile, you can send your latest CV here and tell us your current CTC, expected CTC and notice period.`;
              const sent = await sendWhatsAppFreeform({ to: fromPhone, body: ackBody });
              await admin.from("whatsapp_messages").insert({
                candidate_id: candidateId,
                direction: "outbound",
                to_phone: fromPhone,
                body_preview: ackBody,
                status: sent.ok ? "sent" : sent.status === "not_configured" ? "not_configured" : "failed",
                meta_message_id: sent.ok ? sent.metaMessageId : null,
                error: sent.ok ? null : sent.error,
              });
            }
          }
        }
      }
    }
  } catch (err) {
    // Don't surface to Meta as a delivery failure (it would keep retrying), but do
    // leave a trace so a missed update is visible in the logs.
    console.error("WhatsApp webhook processing failed", err);
  }

  return NextResponse.json({ ok: true });
}
