import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import NewListForm from "./new-list-form";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export default async function ShortlistsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) redirect("/candidates");

  const { data } = await supabase.rpc("candidate_lists_with_counts");
  const lists = (data ?? []) as { id: string; name: string; description: string | null; owner_name: string | null; updated_at: string; n: number | string }[];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      <CandidatesSubNav />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-slate-900 dark:text-slate-100">
            <Bookmark className="h-5 w-5 text-slate-400" /> Shortlists
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
            Lists the whole team can see and add to. Save people from the{" "}
            <Link href="/candidates/board" className="font-medium text-indigo-600 hover:underline">
              Talent board
            </Link>{" "}
            with the Save button on each card.
          </p>
        </div>
        <NewListForm />
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-[13.5px] text-slate-500 dark:border-slate-700">No shortlists yet. Create one above, or tap Save on a card in the Talent board.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lists.map((l) => (
            <Link key={l.id} href={`/candidates/lists/${l.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-ros-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{l.name}</p>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{Number(l.n)}</span>
              </div>
              {l.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-slate-500">{l.description}</p>}
              <p className="mt-3 text-[11.5px] text-slate-400">
                {l.owner_name ? `By ${l.owner_name} · ` : ""}Updated {when(l.updated_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
