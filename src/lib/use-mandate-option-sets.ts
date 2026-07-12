"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Selling style, industries, and languages for mandate forms are read from
// the shared mandate_option_sets table (via get_mandate_option_sets RPC)
// instead of being hardcoded here -- the SAME table also backs the public
// staffanchor.com mandate-request page, so a value added/removed there shows
// up in both places on next load, with no code change or redeploy needed.
// Pre-existing option sets (sub-domains, team size, deal size bands, work
// mode, etc.) remain in candidate-options.ts for now.

export type MandateOptionSets = {
  selling_style: { value: string; label: string }[];
  industries: { value: string; label: string }[];
  languages: { value: string; label: string }[];
};

const EMPTY: MandateOptionSets = { selling_style: [], industries: [], languages: [] };

export function useMandateOptionSets(): MandateOptionSets {
  const [sets, setSets] = useState<MandateOptionSets>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_mandate_option_sets");
      if (!cancelled && data) {
        setSets({
          selling_style: data.selling_style ?? [],
          industries: data.industries ?? [],
          languages: data.languages ?? [],
        });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return sets;
}
