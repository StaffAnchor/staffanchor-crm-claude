"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { clearAiPausedCache } from "@/lib/ai-switch";

// Flips the global AI kill switch. Admin only (checked here, and again by the
// app_config RLS policy), and every flip is written to audit_log.
export async function setAiPaused(paused: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { ok: false, error: "Admins only" };

  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "ai_paused", value: { paused, at: new Date().toISOString(), by: user.id } }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };

  clearAiPausedCache();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const admin = createSupabaseClient(url, key, { auth: { persistSession: false } });
    await admin
      .from("audit_log")
      .insert({ actor: user.id, action: paused ? "ai_paused" : "ai_resumed", entity: "app_config", entity_id: "ai_paused", detail: {} });
  }
  revalidatePath("/analytics/flow");
  return { ok: true };
}
