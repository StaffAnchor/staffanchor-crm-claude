"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RoleControl({
  userId,
  currentRole,
  disabled,
}: {
  userId: string;
  currentRole: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await supabase.rpc("admin_update_user_role", { p_user_id: userId, p_role: e.target.value });
    router.refresh();
  }

  return (
    <select
      defaultValue={currentRole}
      disabled={disabled}
      onChange={handleChange}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
    >
      <option value="recruiter">Recruiter</option>
      <option value="admin">Admin</option>
      <option value="freelancer">Freelancer</option>
    </select>
  );
}
