import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { whatsappEntryLink } from "@/lib/whatsapp-entry";

export const runtime = "nodejs";

const LINES: Record<string, string> = { current_ctc: "Current CTC: ", expected_ctc: "Expected CTC: ", notice: "Notice period: " };

// Short WhatsApp link for outreach emails: opens a chat with a message already typed, with a blank
// line for each detail that person is missing, so replying is one tap and one fill-in.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let lines: string[] = [];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (key && /^[0-9a-f-]{36}$/i.test(id)) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
    const { data } = await admin.from("candidates").select("readiness_missing").eq("id", id).maybeSingle();
    lines = ((data?.readiness_missing as string[] | null) ?? []).filter((k) => LINES[k]).map((k) => LINES[k]);
  }
  const text = lines.length ? `Hi StaffAnchor, here are my details.\n${lines.join("\n")}` : "Hi StaffAnchor, I'm sharing my profile details as requested.";
  return NextResponse.redirect(whatsappEntryLink(text), 302);
}
