import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groupConversations, type WaMessage } from "@/lib/whatsapp-threads";

// How many WhatsApp conversations are waiting on a reply. Feeds the badge on the
// WhatsApp tab. Staff only (the table's own access rule decides what is visible).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ needsReply: 0 }, { status: 401 });

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, created_at, candidate_id, direction, to_phone, body_preview, status, error, template_name")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  const convs = groupConversations((data ?? []) as WaMessage[], new Date().getTime());
  return NextResponse.json({ needsReply: convs.filter((c) => c.needsReply).length });
}
