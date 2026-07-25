import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RestoreMandateButton from "./restore-mandate-button";

export default async function DeletedMandatesPage() {
  const supabase = await createClient();
  const { data: deleted } = await supabase
    .from("deleted_mandates")
    .select("id, role_title, client_name, deleted_at, restored_at, links_snapshot")
    .order("deleted_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <Link href="/mandates" className="text-[12px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
            ← Mandates
          </Link>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight mt-1">Recently deleted</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            Restore a mandate you deleted by mistake -- brings back its candidate links too.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-ros-lg overflow-hidden shadow-ros-sm">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Role</th>
              <th className="text-left px-3 py-2.5">Client</th>
              <th className="text-left px-3 py-2.5">Candidates linked</th>
              <th className="text-left px-3 py-2.5">Deleted</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(deleted ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-[13px]">
                  Nothing deleted recently.
                </td>
              </tr>
            )}
            {(deleted ?? []).map((d) => {
              const linkCount = Array.isArray(d.links_snapshot) ? d.links_snapshot.length : 0;
              return (
                <tr key={d.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70">
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{d.role_title ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{d.client_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{linkCount}</td>
                  <td className="px-3 py-2.5 text-slate-400 text-[12px]">{new Date(d.deleted_at).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right">
                    {d.restored_at ? (
                      <span className="text-[11.5px] text-emerald-600">Restored</span>
                    ) : (
                      <RestoreMandateButton trashId={d.id} roleTitle={d.role_title ?? "this mandate"} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
