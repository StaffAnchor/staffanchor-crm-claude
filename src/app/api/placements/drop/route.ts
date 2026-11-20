import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CRM_STAFF_ROLES } from "@/lib/is-staff-viewer";
import { adminDb } from "@/lib/pro-sessions/core";
import { GUARANTEE_DAYS, daysBetween } from "@/lib/placements/drops";

export const dynamic = "force-dynamic";

const REASON = "Dropped within 90 days of joining";
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

// Any CRM staff member can record a drop; only an admin can tick off a refund, because that is money. Money is never moved here: unpaid fees are cancelled, paid ones are cancelled and flagged
// "refund due", and the refund itself is settled by hand and ticked off afterwards.
//   drop            a placed person left (or never joined) within 90 days: stage -> pulled back, billing cancelled
//   cancel_billing  the person is already off the placement (older cases): just stop the fees
//   refund_settled  tick off a refund that has been paid back
//   undo            put a drop right back: placed again, fees restored to exactly what they were
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = me?.role as string | undefined;
  if (!role || !(CRM_STAFF_ROLES as readonly string[]).includes(role)) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const admin = adminDb();
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; linkId?: string; feeId?: string; droppedOn?: string; reason?: string; note?: string };
  const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

  if (b.action === "refund_settled") {
    if (role !== "admin") return fail("Only an admin can mark a refund as paid back.", 403);
    if (!b.feeId) return fail("Which fee?");
    const { error } = await admin.from("placement_fee_tranches").update({ refund_settled_at: new Date().toISOString() }).eq("id", b.feeId).eq("refund_due", true);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  if (!b.linkId) return fail("Which placement?");
  const { data: link } = await admin.from("candidate_mandate_links").select("id, stage, date_of_joining, dropped_at").eq("id", b.linkId).maybeSingle();
  if (!link) return fail("Placement not found.", 404);
  const nowIso = new Date().toISOString();

  async function cancelFees(reason: string) {
    const { data: fees } = await admin!.from("placement_fee_tranches").select("id, status, payment_received_at, proforma_emailed_at, final_emailed_at, proforma_invoice_number, final_invoice_number").eq("link_id", b.linkId!).neq("status", "cancelled");
    let cancelled = 0, refundDue = 0;
    const emailed: string[] = [];
    const items: { id: string; status: string }[] = [];
    for (const f of (fees ?? []) as { id: string; status: string; payment_received_at: string | null; proforma_emailed_at: string | null; final_emailed_at: string | null; proforma_invoice_number: string | null; final_invoice_number: string | null }[]) {
      const paid = !!f.payment_received_at;
      const { error } = await admin!.from("placement_fee_tranches").update({ status: "cancelled", cancelled_at: nowIso, cancel_reason: reason, cancelled_from_status: f.status, refund_due: paid }).eq("id", f.id);
      if (error) throw new Error(error.message);
      items.push({ id: f.id, status: f.status });
      cancelled++;
      if (paid) refundDue++;
      if (f.proforma_emailed_at || f.final_emailed_at) emailed.push(f.final_invoice_number ?? f.proforma_invoice_number ?? "an invoice");
    }
    return { cancelled, refundDue, emailed, items };
  }

  async function restoreFees(items: { id: string; status: string }[]) {
    for (const f of items) await admin!.from("placement_fee_tranches").update({ status: f.status, cancelled_at: null, cancel_reason: null, cancelled_from_status: null, refund_due: false, refund_settled_at: null }).eq("id", f.id);
  }

  try {
    if (b.action === "drop") {
      const wasPlaced = link.stage === "placed";
      if (!wasPlaced && !["pulled_back", "rejected"].includes(link.stage as string)) return fail("This person is not in the Placed stage.");
      if (link.dropped_at) return fail("A drop is already recorded for this placement.");
      if (!isDate(b.droppedOn)) return fail("Pick the date they left.");
      if (b.droppedOn > today()) return fail("That date is in the future.");
      if (!link.date_of_joining) return fail("This placement has no joining date.");
      const days = daysBetween(link.date_of_joining as string, b.droppedOn);
      if (days > GUARANTEE_DAYS) return fail(`That is ${days} days after joining, past the ${GUARANTEE_DAYS}-day guarantee, so the fee stays. Log it as a retention check-in instead.`);
      const reason = [String(b.reason ?? "").trim().slice(0, 80), String(b.note ?? "").trim().slice(0, 300)].filter(Boolean).join(": ") || REASON;
      // Fees first, so the database's own cancel-on-leaving-placed rule finds nothing left to touch and every fee keeps its history.
      const r = await cancelFees(REASON);
      // Already pulled back some other way: only the date and reason are added, the stage stays as it is.
      const patch = wasPlaced ? { stage: "pulled_back", stage_updated_at: nowIso, stage_source: "recruiter", dropped_at: b.droppedOn, drop_reason: reason } : { dropped_at: b.droppedOn, drop_reason: reason };
      const { error } = await admin.from("candidate_mandate_links").update(patch).eq("id", b.linkId);
      if (error) {
        await restoreFees(r.items);
        return fail(error.message, 500);
      }
      return NextResponse.json({ ok: true, cancelled: r.cancelled, refundDue: r.refundDue, emailed: r.emailed });
    }

    if (b.action === "cancel_billing") {
      if (link.stage === "placed" && !link.dropped_at) {
        // Still placed with nothing recorded: treat as a drop on the date given, so the history is complete.
        return fail("Use Dropped on this placement first, so the date it ended is recorded.");
      }
      const r = await cancelFees(REASON);
      return NextResponse.json({ ok: true, cancelled: r.cancelled, refundDue: r.refundDue, emailed: r.emailed });
    }

    if (b.action === "undo") {
      if (!link.dropped_at) return fail("This placement was not marked as dropped here, so there is nothing to undo.");
      // Fees come back first: putting the person back in Placed makes the database create fresh fees when none are live.
      const { data: fees } = await admin.from("placement_fee_tranches").select("id, cancelled_from_status").eq("link_id", b.linkId).eq("cancel_reason", REASON);
      let restored = 0;
      for (const f of (fees ?? []) as { id: string; cancelled_from_status: string | null }[]) {
        await restoreFees([{ id: f.id, status: f.cancelled_from_status ?? "pending" }]);
        restored++;
      }
      const { error } = await admin.from("candidate_mandate_links").update({ stage: "placed", stage_updated_at: nowIso, stage_source: "recruiter", dropped_at: null, drop_reason: null }).eq("id", b.linkId);
      if (error) return fail(error.message, 500);
      return NextResponse.json({ ok: true, restored });
    }
    return fail("Unknown action.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "That did not save.", 500);
  }
}
