import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mentionsClientName } from "@/lib/blind-text";

// Toggle whether a mandate appears on the referrer blind-brief board, and
// whether Trusted-tier referrers see the client company name for it. This
// is the single on/off switch referenced in roles/page.tsx.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.referralVisible === "boolean") update.referral_visible = body.referralVisible;
  if (typeof body.revealCompany === "boolean") update.referral_reveal_company_to_trusted = body.revealCompany;
  // Admin-approved crisp write-up for referrers, saved alongside the
  // visibility flip when the admin confirms it in the review modal (see
  // mandate-visibility-control.tsx) so a mandate never goes visible with
  // an un-reviewed or stale summary.
  if (typeof body.referralSummary === "string") {
    const summary = body.referralSummary.trim();
    // The write-up is the one free-text field referrers read, so it must never name the client.
    if (summary) {
      const { data: m } = await supabase.from("mandates").select("client_name").eq("id", id).single();
      if (mentionsClientName(summary, m?.client_name)) {
        return NextResponse.json({ error: "The summary mentions the client's name. Please remove it, since referrers must not see the company." }, { status: 400 });
      }
    }
    update.referral_summary = summary || null;
  }

  const { error } = await supabase.from("mandates").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
