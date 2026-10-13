import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { draftPipelineRoles, publishPipelineRoles } from "@/lib/marketing/pipeline-roles";

export const maxDuration = 60;

// Owner-only: drafts 5 to 7 pipeline roles with AI, publishes them to the jobs
// site and stores a LinkedIn post for each, in one go.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { count?: number };
  const count = Math.min(7, Math.max(5, Math.round(Number(body.count) || 6)));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Server is missing its database key." }, { status: 503 });
  const admin = createAdmin(url, key, { auth: { persistSession: false } });

  const { data: existing } = await admin.from("mandates").select("role_title, city").eq("listing_kind", "pipeline").in("status", ["open", "on_hold"]);
  const titles = ((existing ?? []) as { role_title: string; city: string | null }[]).map((m) => `${m.role_title} · ${m.city ?? ""}`);

  try {
    const roles = await draftPipelineRoles(count, titles);
    if (roles.length === 0) return NextResponse.json({ error: "The AI did not return usable roles. Please try again." }, { status: 502 });
    const published = await publishPipelineRoles(admin, roles, user.id);
    return NextResponse.json({ ok: true, created: published.roles.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
  }
}
