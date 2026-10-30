"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Count of candidates colleagues have recommended to you that you have not opened yet, shown on the Inbox tab.
export default function RecommendedNavBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase.from("candidate_recommendations").select("id", { count: "exact", head: true }).eq("to_user", user.id).eq("status", "new").is("seen_at", null);
      if (!cancelled) setN(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (n <= 0) return null;
  return <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-teal-500 px-1 text-xs font-semibold tabular-nums text-white" aria-label={`${n} recommended for you`}>{n}</span>;
}
