import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { listOrphanFiles } from "@/lib/orphan-files";
import FilesView from "./files-view";

export const dynamic = "force-dynamic";

export default async function CvFilesSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) redirect("/candidates");

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = key ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
  const files = admin ? await listOrphanFiles(admin) : [];
  const total = admin ? (await admin.rpc("cv_coverage")).data : null;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <FilesView files={files} isAdmin={profile.role === "admin"} totalProfiles={Number((total as { total?: number } | null)?.total ?? 0)} />
    </div>
  );
}
