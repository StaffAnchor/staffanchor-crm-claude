import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Opens an unattached CV file (short-lived link) so it can be looked at before deciding.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const path = req.nextUrl.searchParams.get("path");
  if (!key || !path) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const { data } = await admin.storage.from("resumes").createSignedUrl(path, 300);
  if (!data?.signedUrl) return NextResponse.json({ error: "File not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, 302);
}
