import type { SupabaseClient } from "@supabase/supabase-js";

// Profiles sent to a client by email or WhatsApp, never through the portal. Marking one lets its stage move on without the
// portal's share checks. It never makes the person visible in the portal.

/** The readable message from anything a save can throw. Database errors are plain objects, not Error instances. */
export function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return fallback;
}

/** True when a stage change was refused because the person was never made ready for the client portal. */
export const isNotClientReady = (e: unknown) => errorText(e, "").includes("NOT_CLIENT_READY");

/** What was still needed, in plain words, from a NOT_CLIENT_READY message. */
export function stillNeeded(e: unknown): string {
  const m = errorText(e, "").match(/Still needed:\s*(.*?)\.\s*Use "Confirm details"/s);
  return m ? m[1] : "";
}

export async function markSharedOffline(supabase: SupabaseClient, linkId: string, note?: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("candidate_mandate_links")
    .update({ shared_offline_at: new Date().toISOString(), shared_offline_note: (note ?? "").trim().slice(0, 300) || "Shared with the client outside the portal", shared_offline_by: user?.id ?? null })
    .eq("id", linkId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("You don't have permission to change this role.");
}
