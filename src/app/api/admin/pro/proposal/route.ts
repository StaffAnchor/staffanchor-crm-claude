import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { draftProposal, offers } from "@/lib/pro-sessions/proposal";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { requestText?: string; firstName?: string; serviceSlug?: string };
  const { data: services } = await db.from("pro_services").select("slug, title, duration_min, price_inr").eq("active", true).order("sort");
  const r = await draftProposal({
    requestText: typeof b.requestText === "string" ? b.requestText : "",
    firstName: typeof b.firstName === "string" ? b.firstName.trim().slice(0, 40) : "",
    preferSlug: b.serviceSlug ?? null,
    offers: offers(services ?? []),
  });
  return NextResponse.json(r);
}
