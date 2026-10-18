import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppFreeform } from "@/lib/whatsapp";
import { WINDOW_MS } from "@/lib/whatsapp-threads";
import { questionKeywords } from "@/lib/whatsapp-bot/faq";

export const runtime = "nodejs";
export const maxDuration = 60;

const uuid = /^[0-9a-f-]{36}$/i;

// Teaching the assistant. A person answers a question once; the answer is saved, every waiting copy of that question is
// marked answered, and (if chosen) the answer goes straight to the people still inside their 24-hour window.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown; answer?: unknown; sendNow?: unknown; answerId?: unknown; active?: unknown };
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string" && uuid.test(x)).slice(0, 100);

  if (b.action === "toggle" && typeof b.answerId === "string" && typeof b.active === "boolean") {
    const { error } = await supabase.from("bot_answers").update({ active: b.active }).eq("id", b.answerId);
    return error ? NextResponse.json({ error: "Couldn't update that." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (b.action === "delete" && typeof b.answerId === "string") {
    await supabase.from("bot_answers").delete().eq("id", b.answerId);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "ignore" && ids.length) {
    await supabase.from("bot_questions").update({ status: "ignored" }).in("id", ids);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "answer") {
    const answer = typeof b.answer === "string" ? b.answer.trim().slice(0, 1500) : "";
    if (!answer || ids.length === 0) return NextResponse.json({ error: "Write the answer first." }, { status: 400 });
    const { data: qs } = await supabase.from("bot_questions").select("id, phone_key, candidate_id, text, created_at").in("id", ids).eq("status", "open");
    const questions = (qs ?? []) as { id: string; phone_key: string; candidate_id: string | null; text: string; created_at: string }[];
    if (questions.length === 0) return NextResponse.json({ error: "Those questions were already handled." }, { status: 409 });

    // One saved answer per way of asking, so the assistant recognises each phrasing next time.
    const distinct = Array.from(new Map(questions.map((q) => [q.text.toLowerCase(), q.text])).values()).slice(0, 8);
    let firstId: string | null = null;
    for (const text of distinct) {
      const { data: row } = await supabase.from("bot_answers").insert({ question: text, keywords: questionKeywords(text), answer, created_by: user.id }).select("id").single();
      firstId = firstId ?? row?.id ?? null;
    }
    await supabase.from("bot_questions").update({ status: "answered", answer_id: firstId }).in("id", questions.map((q) => q.id));

    let sent = 0;
    if (b.sendNow === true) {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const admin = key ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } }) : null;
      const seen = new Set<string>();
      for (const q of questions) {
        if (seen.has(q.phone_key) || Date.now() - new Date(q.created_at).getTime() > WINDOW_MS) continue;
        seen.add(q.phone_key);
        const r = await sendWhatsAppFreeform({ to: q.phone_key, body: answer });
        if (admin) {
          await admin.from("whatsapp_messages").insert({ candidate_id: q.candidate_id, direction: "outbound", to_phone: q.phone_key, body_preview: answer, status: r.ok ? "sent" : "failed", template_name: "bot:faq", meta_message_id: r.ok ? r.metaMessageId : null, error: r.ok ? null : r.error, sent_by: user.id });
          if (r.ok) await admin.from("whatsapp_contacts").update({ needs_human: false, needs_human_reason: null }).eq("phone_key", q.phone_key);
        }
        if (r.ok) sent++;
      }
    }
    return NextResponse.json({ ok: true, saved: distinct.length, answered: questions.length, sent });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
