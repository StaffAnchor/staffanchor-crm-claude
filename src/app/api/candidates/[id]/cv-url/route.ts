import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// A short-lived link to one candidate's CV, for previewing it without leaving the page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { data: cand } = await supabase.from("candidates").select("resume_file_url").eq("id", id).maybeSingle();
  const path = (cand?.resume_file_url as string | null)?.replace(/^resumes\//, "");
  if (!path) return NextResponse.json({ error: "No CV on file for this candidate." }, { status: 404 });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { data } = await admin.storage.from("resumes").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return NextResponse.json({ error: "The CV file could not be opened." }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl, fileName: path.replace(/^[0-9a-f-]{36}-/, "") });
}
