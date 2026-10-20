import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { TIERS, type TierKey } from "@/lib/resume-orders/core";

export const dynamic = "force-dynamic";

// Who an intake link belongs to, for the form's heading. Only paid orders can use it.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || token.length < 10) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data } = await db.from("resume_orders").select("tier, name, status, intake_at").eq("intake_token", token).maybeSingle();
  if (!data || data.status === "pending_payment" || data.status === "failed") return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const t = TIERS[data.tier as TierKey];
  return NextResponse.json({ ok: true, tierLabel: t.label, name: data.name, alreadySubmitted: !!data.intake_at });
}
