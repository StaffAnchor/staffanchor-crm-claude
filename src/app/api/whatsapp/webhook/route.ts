import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
          await admin
            .from("whatsapp_messages")
            .update({
              status: status.status, // "sent" | "delivered" | "read" | "failed"
              error: status?.errors?.[0]?.title ?? null,
              raw_payload: status,
            })
            .eq("meta_message_id", metaMessageId);
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

          await admin.from("whatsapp_messages").insert({
            candidate_id: candidateId,
            direction: "inbound",
            to_phone: fromPhone,
            body_preview: bodyText,
            status: "delivered",
            meta_message_id: message?.id ?? null,
            raw_payload: message,
          });
        }
      }
    }
  } catch {
    // Swallow -- webhook processing failures shouldn't surface to Meta as
    // a delivery failure; worst case a status update is missed, not fatal.
  }

  return NextResponse.json({ ok: true });
}
