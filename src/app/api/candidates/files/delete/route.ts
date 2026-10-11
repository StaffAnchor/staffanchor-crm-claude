import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { stillOrphaned } from "@/lib/orphan-files";

export const runtime = "nodejs";

// Deletes CV files that no profile uses. Admin only. The database is asked again at delete time, so a
// file that has since been attached to a profile, or is less than a day old, is never removed.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Only an admin can delete files." }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const body = (await req.json().catch(() => ({}))) as { paths?: string[] };
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string").slice(0, 300) : [];
  if (paths.length === 0) return NextResponse.json({ error: "No files selected." }, { status: 400 });

  const safe = Array.from(await stillOrphaned(admin, paths));
  if (safe.length === 0) return NextResponse.json({ ok: true, deleted: 0, skipped: paths.length });
  const { error } = await admin.storage.from("resumes").remove(safe);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_log").insert({ actor: user.id, action: "orphan_cv_files_deleted", entity: "storage", entity_id: "resumes", detail: { count: safe.length, sample: safe.slice(0, 5) } });
  return NextResponse.json({ ok: true, deleted: safe.length, skipped: paths.length - safe.length });
}
