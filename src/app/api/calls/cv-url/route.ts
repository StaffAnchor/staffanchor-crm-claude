import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";

// A short-lived link to one person's CV, asked for when their card opens (and for the next card in advance), so the
// Calls today page does not have to prepare fifty links before it can show anything.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // Read through the signed-in person's own access first, so nobody gets a link to a CV they cannot open.
  const { data: c } = await supabase.from("candidates").select("resume_file_url").eq("id", id).maybeSingle();
  const path = (c?.resume_file_url as string | null)?.replace(/^resumes\//, "");
  if (!path) return NextResponse.json({ url: null });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ url: null });
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { data } = await admin.storage.from("resumes").createSignedUrl(path, 4 * 3600);
  return NextResponse.json({ url: data?.signedUrl ?? null });
}
