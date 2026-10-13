"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Marks a website message as dealt with (or puts it back). Staff only.
export async function setHandled(id: string, handled: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return { ok: false, error: "Not permitted" };

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return { ok: false, error: "Not configured" };
  const admin = createSupabaseClient(url, key, { auth: { persistSession: false } });
  const { error } = await admin
    .from("public_assist_events")
    .update({ handled_at: handled ? new Date().toISOString() : null, handled_by: handled ? user.id : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/client-acquisition/website-messages");
  return { ok: true };
}
