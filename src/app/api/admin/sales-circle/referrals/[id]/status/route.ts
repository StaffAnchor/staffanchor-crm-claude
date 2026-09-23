import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = [
  "submitted","screened","candidate_interested","submitted_to_client","interviewing",
  "offered","joined","ninety_days_completed","payment_received","payout_processed",
  "not_suitable","candidate_declined","dropped_out","left_before_90_days",
];

// Recruiter/admin status update on a referral -- also writes the audit
// trail row and, on first reaching "joined", seeds a
// sales_circle_referral_payouts row so it shows up on the admin payouts
// list to work from (the slab lookup happens here since the referral now
// has a mandate with a CTC band to match against; a bench referral with no
// mandate just gets a payout row with no slab_amount, for the admin to fill
// in manually).
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

  const { status, statusReason, internalNotes } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: referral } = await supabase
    .from("sales_circle_referrals")
    .select("id, status, mandate_id, mandates(budget_max)")
    .eq("id", id)
    .single();
  if (!referral) return NextResponse.json({ error: "Referral not found" }, { status: 404 });

  const { error: updateError } = await supabase
    .from("sales_circle_referrals")
    .update({
      status,
      status_reason: statusReason ?? null,
      internal_notes: internalNotes ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("sales_circle_referral_status_history").insert({
    referral_id: id,
    from_status: referral.status,
    to_status: status,
    changed_by: user.id,
    note: statusReason ?? null,
  });

  if (status === "joined") {
    const { data: existingPayout } = await supabase
      .from("sales_circle_referral_payouts")
      .select("id")
      .eq("referral_id", id)
      .maybeSingle();
    if (!existingPayout) {
      const mandate = Array.isArray(referral.mandates) ? referral.mandates[0] : referral.mandates;
      let slabAmount: number | null = null;
      if (mandate?.budget_max != null) {
        const { data: slab } = await supabase
          .from("sales_circle_payout_slabs")
          .select("payout_amount")
          .eq("active", true)
          .lte("ctc_band_min", mandate.budget_max)
          .or(`ctc_band_max.is.null,ctc_band_max.gt.${mandate.budget_max}`)
          .order("ctc_band_min", { ascending: false })
          .limit(1)
          .maybeSingle();
        slabAmount = slab?.payout_amount ?? null;
      }
      await supabase.from("sales_circle_referral_payouts").insert({
        referral_id: id,
        slab_amount: slabAmount,
        status: "pending",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
