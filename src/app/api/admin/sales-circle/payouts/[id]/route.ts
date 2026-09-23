import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Payout = min(slab_amount, 30% of fee actually received), per spec section
// 5 -- computed here whenever fee_received_amount is set/changed, not left
// for the admin to calculate by hand.
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
  const { data: payout } = await supabase
    .from("sales_circle_referral_payouts")
    .select("id, slab_amount")
    .eq("id", id)
    .single();
  if (!payout) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

  const feeReceivedAmount = body.feeReceivedAmount != null ? Number(body.feeReceivedAmount) : null;
  const slabAmount = body.slabAmount != null ? Number(body.slabAmount) : payout.slab_amount;
  const computedPayoutAmount =
    feeReceivedAmount != null && slabAmount != null ? Math.min(slabAmount, feeReceivedAmount * 0.3) : null;
  const tdsAmount = body.tdsAmount != null ? Number(body.tdsAmount) : null;
  const netAmount = computedPayoutAmount != null ? computedPayoutAmount - (tdsAmount ?? 0) : null;

  const update: Record<string, unknown> = {
    slab_amount: slabAmount,
    fee_received_amount: feeReceivedAmount,
    computed_payout_amount: computedPayoutAmount,
    tds_amount: tdsAmount,
    net_amount: netAmount,
    updated_at: new Date().toISOString(),
  };
  if (body.eligibilityDate) update.eligibility_date = body.eligibilityDate;
  if (body.status) update.status = body.status;
  if (body.status === "paid") update.paid_date = body.paidDate ?? new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("sales_circle_referral_payouts").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
