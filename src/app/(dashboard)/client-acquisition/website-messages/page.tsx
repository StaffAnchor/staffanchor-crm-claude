import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import MessagesView, { type WebsiteMessage } from "./messages-view";

export const dynamic = "force-dynamic";

// Messages typed into the website message box where the visitor then did something: left an email or
// mobile number, or tapped the main next step. Everything else typed there is only used to improve the
// routing and is not shown here. Read with the service key because the table has no staff policies.
export default async function WebsiteMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) redirect("/candidates");

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let rows: WebsiteMessage[] = [];
  if (key && url) {
    const admin = createSupabaseClient(url, key, { auth: { persistSession: false } });
    const since = new Date(new Date().getTime() - 60 * 86_400_000).toISOString();
    const { data } = await admin
      .from("public_assist_events")
      .select("id, created_at, site, kind, message, intent, entities, contact, handled_at")
      .in("kind", ["contact", "confirmed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
    rows = (data ?? []) as WebsiteMessage[];
  }
  return <MessagesView rows={rows} />;
}
