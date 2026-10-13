import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { profileDetailsTemplate, roleOpportunityTemplate, templateNameForTaskType } from "@/lib/whatsapp";

export const runtime = "nodejs";

// Which approved WhatsApp templates are set up, so buttons that need one can show or hide themselves.
// Only yes/no per template, never the names.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({
    details: !!profileDetailsTemplate(),
    opportunity: !!roleOpportunityTemplate(),
    interview: !!templateNameForTaskType("TRIGGER_INTERVIEW_COORDINATION"),
    offer: !!templateNameForTaskType("FOLLOW_UP_ON_OFFER"),
  });
}
