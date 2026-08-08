import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSalesOutreach, type OutreachChannel } from "@/lib/generate-sales-outreach";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, outreach_sender_name, outreach_sender_bio")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const channel: OutreachChannel = body?.channel === "email" ? "email" : "linkedin";

  const { data: lead, error: leadError } = await supabase
    .from("sales_leads")
    .select("company_name, contact_name, contact_title, company_industry, company_size, source, notes, stage")
    .eq("id", id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const result = await generateSalesOutreach({
    channel,
    company_name: lead.company_name,
    contact_name: lead.contact_name,
    contact_title: lead.contact_title,
    company_industry: lead.company_industry,
    company_size: lead.company_size,
    source: lead.source,
    notes: lead.notes,
    stage: lead.stage,
    // Per-user outreach persona (task: "per-user AI outreach persona") --
    // falls back to the founder voice when a rep hasn't set their own.
    sender_name: profile.outreach_sender_name || profile.full_name,
    sender_bio: profile.outreach_sender_bio,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ draft: result.draft });
}
