import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { questionKeywords, similarity, type FaqAnswer } from "@/lib/whatsapp-bot/faq";
import TrainingView, { type QGroup, type SavedAnswer } from "./training-view";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: qs }, { data: ans }] = await Promise.all([
    supabase.from("bot_questions").select("id, phone_key, candidate_id, text, reason, created_at, candidates(full_name)").eq("status", "open").order("created_at", { ascending: false }).limit(300),
    supabase.from("bot_answers").select("id, question, keywords, answer, active, uses, last_used_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const answers = (ans ?? []) as (FaqAnswer & { active: boolean; uses: number; last_used_at: string | null })[];

  // Questions that are the same question in different words are shown together, so each is answered once.
  type Row = { id: string; phone_key: string; text: string; reason: string | null; created_at: string; candidates: { full_name: string | null } | { full_name: string | null }[] | null };
  const groups: { kw: string[]; rows: Row[] }[] = [];
  for (const r of (qs ?? []) as unknown as Row[]) {
    const kw = questionKeywords(r.text);
    const g = groups.find((x) => similarity(kw, x.kw) >= 0.6);
    if (g) g.rows.push(r);
    else groups.push({ kw, rows: [r] });
  }
  const out: QGroup[] = groups.map((g) => {
    const first = g.rows[0];
    const sim = answers.map((a) => ({ a, s: similarity(g.kw, a.keywords) })).filter((x) => x.s >= 0.3).sort((x, y) => y.s - x.s)[0];
    return {
      ids: g.rows.map((r) => r.id),
      text: first.text,
      others: Array.from(new Set(g.rows.map((r) => r.text).filter((t) => t !== first.text))).slice(0, 3),
      count: new Set(g.rows.map((r) => r.phone_key)).size,
      who: Array.from(new Set(g.rows.map((r) => (Array.isArray(r.candidates) ? r.candidates[0]?.full_name : r.candidates?.full_name) ?? "Unknown"))).slice(0, 3),
      latest: first.created_at,
      reason: first.reason,
      suggestion: sim ? { answer: sim.a.answer, question: sim.a.question } : null,
    };
  });
  const saved: SavedAnswer[] = answers.map((a) => ({ id: a.id, question: a.question, answer: a.answer, active: a.active, uses: a.uses, lastUsedAt: a.last_used_at }));

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <Link href="/whatsapp" className="text-[12px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-100">
        ← WhatsApp
      </Link>
      <h1 className="ros-page-title mt-2">Teach the assistant</h1>
      <p className="mt-1 max-w-2xl text-[13px] text-slate-500">When a candidate asks something the assistant can&apos;t answer, it hands the chat to a person and the question lands here. Answer it once and the assistant replies the same way next time. It only answers a question that is clearly the same as one you taught it; anything else still comes to you.</p>
      <TrainingView groups={out} saved={saved} />
    </div>
  );
}
