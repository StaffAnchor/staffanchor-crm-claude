import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mentionsClientName } from "@/lib/blind-text";

// Publish or unpublish a mandate on the referrer board. A role can only go
// live with a payout the admin set for that role. The client company name is
// never shown to referrers, so there is no reveal option.
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

  // The payout is chosen by an admin for each role, in rupees.
  if (body.referralPayout !== undefined && body.referralPayout !== null && body.referralPayout !== "") {
    const amount = Number(String(body.referralPayout).replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
      return NextResponse.json({ error: "Enter the payout as an amount in rupees, for example 30000." }, { status: 400 });
    }
    update.referral_payout_amount = amount;
  }
  // Publishing needs a payout: either just entered, or already saved on the role.
  if (body.referralVisible === true && update.referral_payout_amount == null) {
    const { data: m } = await supabase.from("mandates").select("referral_payout_amount").eq("id", id).single();
    if (!m?.referral_payout_amount || Number(m.referral_payout_amount) <= 0) {
      return NextResponse.json({ error: "Set a payout for this role before publishing it to referrers." }, { status: 400 });
    }
  }

  const { error } = await supabase.from("mandates").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
