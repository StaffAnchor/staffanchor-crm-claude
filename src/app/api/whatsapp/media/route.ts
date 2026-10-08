import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
  const { data: msg } = await supabase.from("whatsapp_messages").select("media_path").eq("id", id).maybeSingle();
  if (!msg?.media_path) return NextResponse.json({ error: "No file on that message" }, { status: 404 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const { data: signed } = await admin.storage.from("client-resources").createSignedUrl(msg.media_path as string, 120);
  if (!signed?.signedUrl) return NextResponse.json({ error: "File not found" }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
