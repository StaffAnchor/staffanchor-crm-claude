import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { phoneKey } from "@/lib/whatsapp-threads";

// Recruiter controls for one WhatsApp chat: archive (for example test chats), mute, relabel
// as jobseeker / employer / referrer / other, pause or resume the assistant, mark handled.
const KINDS = ["jobseeker", "employer", "referrer", "other", "unsorted"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { phone, action, kind } = await req.json();
  const key = phoneKey(typeof phone === "string" ? phone : null);
  if (!key) return NextResponse.json({ error: "A phone number is required." }, { status: 400 });

  const now = new Date().toISOString();
  let patch: Record<string, unknown> | null = null;
  if (action === "archive") patch = { archived_at: now, archived_by: user.id };
  else if (action === "archive_mute") patch = { archived_at: now, archived_by: user.id, muted: true };
  else if (action === "unarchive") patch = { archived_at: null, archived_by: null, muted: false };
  else if (action === "pause_bot") patch = { bot_paused: true };
  else if (action === "resume_bot") patch = { bot_paused: false, needs_human: false, needs_human_reason: null };
  else if (action === "mark_handled") patch = { needs_human: false, needs_human_reason: null };
  else if (action === "set_kind" && KINDS.includes(kind)) patch = { kind, kind_source: "manual" };
  if (!patch) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const { error } = await supabase.from("whatsapp_contacts").upsert({ phone_key: key, ...patch }, { onConflict: "phone_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
