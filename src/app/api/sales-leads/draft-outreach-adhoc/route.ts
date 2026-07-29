import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSalesOutreach, type OutreachChannel } from "@/lib/generate-sales-outreach";

// Same drafting logic as /api/sales-leads/[id]/draft-outreach, but for a
// company the founder found on LinkedIn and hasn't (yet, or ever) added as
// a sales_leads row -- no DB lookup, everything comes straight from the
// request body. Lets him generate a message before deciding whether the
// prospect is even worth tracking as a lead.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const channel: OutreachChannel = body?.channel === "email" ? "email" : "linkedin";
  const company_name = typeof body?.company_name === "string" ? body.company_name.trim() : "";

  if (!company_name) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }

  const result = await generateSalesOutreach({
    channel,
    company_name,
    contact_name: typeof body?.contact_name === "string" ? body.contact_name.trim() || null : null,
    contact_title: typeof body?.contact_title === "string" ? body.contact_title.trim() || null : null,
    company_industry: typeof body?.company_industry === "string" ? body.company_industry.trim() || null : null,
    notes: typeof body?.notes === "string" ? body.notes.trim() || null : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ draft: result.draft });
}
