import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateMandateForm from "./create-mandate-form";

export default async function MandatesPage() {
  const supabase = await createClient();
  const { data: mandates } = await supabase
    .from("mandates")
    .select("id, client_name, role_title, category, sub_domain, city, status, target_fill_date")
    .order("created_at", { ascending: false });

  const { data: linkCounts } = await supabase
    .from("candidate_mandate_links")
    .select("mandate_id");

  const counts: Record<string, number> = {};
  (linkCounts ?? []).forEach((l) => {
    counts[l.mandate_id] = (counts[l.mandate_id] ?? 0) + 1;
  });

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <h1 className="text-xl font-semibold text-slate-900 mb-4">Mandates</h1>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Client / Role</th>
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-left px-4 py-2.5">City</th>
                <th className="text-left px-4 py-2.5">Candidates linked</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(mandates ?? []).map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/mandates/${m.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                      {m.role_title}
                    </Link>
                    <div className="text-xs text-slate-500">{m.client_name}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.category?.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-slate-600">{m.city ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{counts[m.id] ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(mandates ?? []).length === 0 && (
            <p className="text-sm text-slate-500 text-center py-10">No mandates yet.</p>
          )}
        </div>
      </div>
      <div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">New mandate</h2>
          <CreateMandateForm />
        </div>
      </div>
    </div>
  );
}
