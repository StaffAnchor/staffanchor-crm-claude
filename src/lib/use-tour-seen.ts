"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Backs the contextual onboarding coach-marks (see TourTooltip). One row
// per (user, tour_key) in feature_tours_seen -- a tour is "seen" the moment
// the user dismisses it once, permanently, across sessions and devices.
// Deliberately per-user rather than a localStorage flag, since recruiters
// often use more than one machine and a coach-mark that keeps coming back
// on a new device is more annoying than helpful.
export function useTourSeen(tourKey: string) {
  const [seen, setSeen] = useState(true); // default true so nothing flashes in before we know
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("feature_tours_seen")
        .select("id")
        .eq("user_id", user.id)
        .eq("tour_key", tourKey)
        .maybeSingle();
      if (!cancelled) {
        setSeen(!!data);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tourKey]);

  async function markSeen() {
    setSeen(true); // optimistic -- dismiss immediately, don't make the user wait on a round-trip
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("feature_tours_seen").upsert(
      { user_id: user.id, tour_key: tourKey },
      { onConflict: "user_id,tour_key", ignoreDuplicates: true }
    );
  }

  return { seen, loading, markSeen };
}
