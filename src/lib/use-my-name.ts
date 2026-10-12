"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

let cached: string | null | undefined;

/** The signed-in team member's first name, so message templates carry their own name. */
export function useMyFirstName(): string | null {
  const [name, setName] = useState<string | null>(cached ?? null);
  useEffect(() => {
    if (cached !== undefined) return;
    let alive = true;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      const first = ((data?.full_name as string | null) ?? "").trim().split(/\s+/)[0] || null;
      cached = first;
      if (alive) setName(first);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return name;
}
