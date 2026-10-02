import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AiMatchesPanel from "../ai-matches-panel";

// Full-width home for AI Matches. The tab on the role page is a narrow side
// panel; evidence and questions need room.
export default async function AiMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: role } = await supabase.from("mandates").select("role_title, client_name").eq("id", id).maybeSingle();
  if (!role) notFound();
  return (
    <div className="max-w-[1000px] mx-auto px-5 py-6">
      <Link href={`/mandates/${id}`} className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to the role
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{role.role_title}</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5">{role.client_name}</p>
      <div className="rounded-ros-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <AiMatchesPanel mandateId={id} fullPage />
      </div>
    </div>
  );
}
