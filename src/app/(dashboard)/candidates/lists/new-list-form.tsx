"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function NewListForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let owner: string | null = null;
    if (user) {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      owner = (data?.full_name as string | null) ?? null;
    }
    const { data, error: err } = await supabase.from("candidate_lists").insert({ name: clean, owner_id: user?.id ?? null, owner_name: owner }).select("id").single();
    setBusy(false);
    if (err || !data) return setError("Couldn't create the list.");
    router.push(`/candidates/lists/${data.id}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
        placeholder="New shortlist, e.g. SaaS AEs, Bengaluru"
        maxLength={80}
        className="w-72 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900"
      />
      <button onClick={create} disabled={!name.trim() || busy} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
      </button>
      {error && <span className="text-[12px] text-rose-600">{error}</span>}
    </div>
  );
}
