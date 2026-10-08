import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { downloadWhatsAppMedia, mediaOf, safeFileName } from "@/lib/whatsapp-media";

// Opens a file someone sent on WhatsApp (a job description, say). Staff only; the file lives in
// a private bucket, so we hand out a short-lived link rather than a public one.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // The staff session's own access rule decides whether this message is visible to them.
  const { data: msg } = await supabase.from("whatsapp_messages").select("media_path, raw_payload, to_phone").eq("id", id).maybeSingle();
  if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  const found = mediaOf(msg.raw_payload);
  if (!msg.media_path && !found) return NextResponse.json({ error: "No file on that message" }, { status: 404 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  let path = msg.media_path as string | null;
  if (!path && found) {
    // A file that arrived before we started keeping them: fetch it from WhatsApp now and keep it.
    const media = await downloadWhatsAppMedia(found.id);
    if (!media) return NextResponse.json({ error: "WhatsApp no longer has this file (they expire after about 30 days). Ask them to send it again." }, { status: 410 });
    const name = safeFileName(found.name ?? "file");
    path = `whatsapp/${String(msg.to_phone ?? "").replace(/\D/g, "").slice(-10)}/${crypto.randomUUID()}-${name}`;
    const { error: upErr } = await admin.storage.from("client-resources").upload(path, media.bytes, { contentType: media.mime ?? found.mime ?? undefined });
    if (upErr) return NextResponse.json({ error: "Could not store the file" }, { status: 500 });
    await admin.from("whatsapp_messages").update({ media_path: path, media_name: found.name, media_type: media.mime ?? found.mime }).eq("id", id);
  }
  const { data: signed } = await admin.storage.from("client-resources").createSignedUrl(path as string, 120);
  if (!signed?.signedUrl) return NextResponse.json({ error: "File not found" }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
