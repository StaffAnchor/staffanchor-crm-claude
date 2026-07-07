import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateUserForm from "./create-user-form";
import RoleControl from "./role-control";

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
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Team</h1>
        <p className="text-sm text-slate-500 mb-4">
          Recruiters, admins, and freelancers who can access this CRM.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(profiles ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{p.email}</td>
                  <td className="px-4 py-3">
                    <RoleControl userId={p.id} currentRole={p.role} disabled={p.id === user.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Add team member</h2>
          <CreateUserForm />
        </div>
      </div>
    </div>
  );
}
