"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_AUTO_VIEWS = 3;

// Backs the contextual onboarding coach-marks (see TourTooltip). One row
// per (user, tour_key) in feature_tours_seen. A single glance rarely
// registers, so this doesn't hide the tooltip after one view -- it
// auto-shows again on each of the user's next page loads, up to
// MAX_AUTO_VIEWS times, then stops on its own. Clicking "Got it"/X
// dismisses it immediately regardless of how many times it's been shown.
// Deliberately per-user via DB rather than localStorage, since recruiters
// often use more than one machine and a coach-mark shouldn't reset (or
// keep nagging) just because they switched devices.
export function useTourSeen(tourKey: string) {
  const [shown, setShown] = useState(false); // default false so nothing flashes in before we know
  const [loading, setLoading] = useState(true);
  const [rowId, setRowId] = useState<string | null>(null);

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

      const { data: existing } = await supabase
        .from("feature_tours_seen")
        .select("id, times_seen, dismissed_at")
        .eq("user_id", user.id)
        .eq("tour_key", tourKey)
        .maybeSingle();

      if (!existing) {
        // First time this user has ever hit this tour -- create the row
        // and count this as view #1.
        const { data: created } = await supabase
          .from("feature_tours_seen")
          .insert({ user_id: user.id, tour_key: tourKey, times_seen: 1 })
          .select("id")
          .single();
        if (!cancelled) {
          setRowId(created?.id ?? null);
          setShown(true);
          setLoading(false);
        }
        return;
      }

      const stillEligible = !existing.dismissed_at && existing.times_seen < MAX_AUTO_VIEWS;
      if (stillEligible) {
        await supabase
          .from("feature_tours_seen")
          .update({ times_seen: existing.times_seen + 1 })
          .eq("id", existing.id);
      }
      if (!cancelled) {
        setRowId(existing.id);
        setShown(stillEligible);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tourKey]);

  async function dismiss() {
    setShown(false); // optimistic -- close immediately, don't wait on a round-trip
    if (!rowId) return;
    const supabase = createClient();
    await supabase.from("feature_tours_seen").update({ dismissed_at: new Date().toISOString() }).eq("id", rowId);
  }

  return { shown, loading, dismiss };
}
