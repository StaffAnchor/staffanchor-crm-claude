import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateUserForm from "./create-user-form";
import RoleControl from "./role-control";
import SpecialtiesControl from "./specialties-control";
import PracticesControl from "./practices-control";
import ResetPasswordButton from "./reset-password-button";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (myProfile?.role !== "admin") {
    redirect("/candidates");
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at, specialties")
    .order("created_at", { ascending: true });

  const { data: allPracticesRows } = await supabase
    .from("practices")
    .select("id, slug, name, group_name")
    .order("sort_order", { ascending: true });
  const { data: recruiterPracticeRows } = await supabase
    .from("recruiter_practices")
    .select("user_id, practice_id");
  const practicesByUser = new Map<string, string[]>();
  for (const row of recruiterPracticeRows ?? []) {
    const list = practicesByUser.get(row.user_id) ?? [];
    list.push(row.practice_id);
    practicesByUser.set(row.user_id, list);
  }

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-8 grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">Team</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
          Recruiters, admins, and freelancers who can access this CRM.
        </p>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Role</th>
                <th className="text-left px-4 py-2.5">Specialty</th>
                <th className="text-left px-4 py-2.5">Practices</th>
                <th className="text-left px-4 py-2.5">Password</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(profiles ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.full_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.email}</td>
                  <td className="px-4 py-3">
                    <RoleControl userId={p.id} currentRole={p.role} disabled={p.id === user.id} />
                  </td>
                  <td className="px-4 py-3">
                    <SpecialtiesControl userId={p.id} currentSpecialties={p.specialties ?? []} />
                  </td>
                  <td className="px-4 py-3">
                    <PracticesControl
                      userId={p.id}
                      allPractices={(allPracticesRows ?? []) as never}
                      currentPracticeIds={practicesByUser.get(p.id) ?? []}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ResetPasswordButton userId={p.id} name={p.full_name ?? p.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Add team member</h2>
          <CreateUserForm />
        </div>
      </div>
    </div>
  );
}
