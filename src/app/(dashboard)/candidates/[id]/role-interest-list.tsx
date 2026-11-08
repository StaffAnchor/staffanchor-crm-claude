import { createClient } from "@/lib/supabase/server";

type Row = { interest: string; reason: string | null; updated_at: string; mandates: { role_title: string | null; client_name: string | null } | { role_title: string | null; client_name: string | null }[] | null };

const LABEL: Record<string, { text: string; cls: string }> = {
  interested: { text: "Interested", cls: "bg-emerald-100 text-emerald-700" },
  maybe: { text: "Maybe", cls: "bg-amber-100 text-amber-800" },
  not_interested: { text: "Not interested", cls: "bg-rose-100 text-rose-700" },
};

// What this person said about specific roles on calls. A "not interested" keeps them out of that role's matches and calls.
export default async function RoleInterestList({ candidateId }: { candidateId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("candidate_role_interest").select("interest, reason, updated_at, mandates(role_title, client_name)").eq("candidate_id", candidateId).order("updated_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-ros-lg border border-slate-200 p-4 dark:border-slate-700">
      <p className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">What they said about roles</p>
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const m = Array.isArray(r.mandates) ? r.mandates[0] : r.mandates;
          const l = LABEL[r.interest] ?? LABEL.maybe;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-700 dark:text-slate-200">
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${l.cls}`}>{l.text}</span>
              <span className="font-medium">{m?.role_title ?? "A role"}{m?.client_name ? ` (${m.client_name})` : ""}</span>
              {r.reason && <span className="text-slate-500">{r.reason}</span>}
              <span className="ml-auto text-xs text-slate-400">{new Date(r.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
