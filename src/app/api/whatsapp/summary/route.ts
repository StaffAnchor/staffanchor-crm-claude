import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { loadWaiting } from "@/lib/waiting-queue";

// How many WhatsApp conversations need a reply now. Feeds the badge on the
// WhatsApp tab. Staff only (the table's own access rule decides what is visible).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ needsReply: 0 }, { status: 401 });

  // The same "reply now" rule as the WhatsApp page and Today, so the number on the menu is the number you find inside.
  const admin = adminDb();
  const waiting = admin ? await loadWaiting(admin).catch(() => []) : [];
  return NextResponse.json({ needsReply: waiting.length });
}
