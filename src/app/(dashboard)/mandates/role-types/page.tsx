import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RoleTypeSetup, { type SetupRole } from "./role-type-setup";

export const dynamic = "force-dynamic";

// Matching needs to know what kind of job a role is and at what level, and it never guesses. Every open role without that
// is listed here with a suggestion from its title; check it, correct what is wrong, and save them all in one go.
export default async function RoleTypesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, city, role_cluster, seniority_band")
    .eq("status", "open")
    .eq("is_archived", false)
    .or("role_cluster.is.null,seniority_band.is.null")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as { id: string; role_title: string | null; client_name: string | null; city: string | null; role_cluster: string | null; seniority_band: string | null }[];
  const ids = rows.map((r) => r.id);
  const { data: links } = ids.length ? await supabase.from("candidate_mandate_links").select("mandate_id").in("mandate_id", ids) : { data: [] };
  const count = new Map<string, number>();
  for (const l of (links ?? []) as { mandate_id: string }[]) count.set(l.mandate_id, (count.get(l.mandate_id) ?? 0) + 1);
  const roles: SetupRole[] = rows.map((r) => ({ id: r.id, title: r.role_title ?? "Untitled role", client: r.client_name ?? "", city: r.city ?? "", cluster: r.role_cluster ?? "", level: r.seniority_band ?? "", pipeline: count.get(r.id) ?? 0 }));

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <Link href="/mandates" className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400">← All mandates</Link>
      <h1 className="ros-page-title mt-2">Set the role type</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
        Whether a hire is an individual seller or someone who leads a team changes who fits, so every role needs its type and level before the system can find people for it. I suggest one from each title. Check them, fix any that are wrong, then save.
      </p>
      {roles.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Every open role has its type and level set.</p>
      ) : (
        <RoleTypeSetup roles={roles} />
      )}
    </div>
  );
}
