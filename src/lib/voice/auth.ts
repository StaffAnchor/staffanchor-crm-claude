import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin, type SupabaseClient } from "@supabase/supabase-js";

/** Staff (admin, recruiter or partner) only. Returns the service client and the person, or the error response to send. */
export async function requireVoiceStaff(): Promise<{ admin: SupabaseClient; userId: string; role: string } | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  return { admin: createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } }), userId: user.id, role: me.role };
}
