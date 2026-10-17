import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../../candidates-sub-nav";
import TalentCard, { type MandateOption } from "../../board/talent-card";
import { buildTalentCards, CARD_COLUMNS } from "@/lib/talent-cards";
import ListActions from "./list-actions";

export const dynamic = "force-dynamic";

export default async function ShortlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) redirect("/candidates");

  const { data: list } = await supabase.from("candidate_lists").select("id, name, description, owner_id, owner_name, updated_at").eq("id", id).maybeSingle();
  if (!list) notFound();

  const [itemsRes, mandatesRes, listsRes] = await Promise.all([
    supabase.from("candidate_list_items").select("candidate_id, added_by_name, added_at").eq("list_id", id).order("added_at", { ascending: false }),
    supabase.from("mandates").select("id, role_title, city").eq("status", "open").order("created_at", { ascending: false }),
    supabase.rpc("candidate_lists_with_counts"),
  ]);
  const items = (itemsRes.data ?? []) as { candidate_id: string; added_by_name: string | null; added_at: string }[];
  const ids = items.map((i) => i.candidate_id);
  const { data: rows } = ids.length ? await supabase.from("candidates").select(CARD_COLUMNS).in("id", ids) : { data: [] };
  const order = new Map(ids.map((cid, i) => [cid, i]));
  const sorted = ((rows ?? []) as unknown as Record<string, unknown>[]).sort((a, b) => (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0));
  const cards = await buildTalentCards(supabase, sorted);
  const addedBy = new Map(items.map((i) => [i.candidate_id, i.added_by_name]));
  const mandates = (mandatesRes.data ?? []) as MandateOption[];
  const allLists = ((listsRes.data ?? []) as { id: string; name: string; n: number | string; owner_name: string | null }[]).map((l) => ({ id: l.id, name: l.name, n: Number(l.n), owner_name: l.owner_name }));
  const canEdit = list.owner_id === user.id || me.role === "admin";

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8">
      <CandidatesSubNav />
      <Link href="/candidates/lists" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-teal-600 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> All shortlists
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-slate-900 dark:text-slate-100">
            <Bookmark className="h-5 w-5 shrink-0 text-slate-400" /> <span className="truncate">{list.name}</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
            {cards.length} {cards.length === 1 ? "person" : "people"}
            {list.owner_name ? ` · made by ${list.owner_name}` : ""}
          </p>
        </div>
        <ListActions
          listId={list.id}
          name={list.name}
          canEdit={canEdit}
          mandates={mandates}
          rows={cards.map((c) => ({ id: c.id, name: c.full_name, headline: c.headline, city: c.city, experience: c.experience, current_ctc: c.current_ctc, expected_ctc: c.expected_ctc, notice: c.notice, phone: c.phone, has_email: c.has_email }))}
        />
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-[13.5px] text-slate-500 dark:border-slate-700">
          Nobody in this shortlist yet. Open the{" "}
          <Link href="/candidates/inventory" className="font-medium text-teal-600 hover:underline">
            Inventory
          </Link>
          , click a number and use &quot;Save as a shortlist&quot;.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {cards.map((c) => (
            <div key={c.id}>
              <TalentCard c={c} mandates={mandates} lists={allLists} memberOf={[id]} />
              {addedBy.get(c.id) && <p className="mt-1 px-1 text-xs text-slate-400">Added by {addedBy.get(c.id)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
