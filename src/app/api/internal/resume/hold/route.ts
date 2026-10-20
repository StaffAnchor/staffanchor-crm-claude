import { NextRequest, NextResponse } from "next/server";
import { EMAIL_RE, adminDb, cleanPhone } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { TIERS, newToken, tierForYears } from "@/lib/resume-orders/core";

export const dynamic = "force-dynamic";

// Step 1 of a resume order, called by jobs.staffanchor.com: records a pending order at the price set here.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Ordering isn't available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string, max = 200) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const name = str("name", 120);
  const email = str("email", 200).toLowerCase();
  const phone = cleanPhone(str("phone", 30));
  // The price follows years of experience only; the plan is worked out here, never taken from the browser.
  const years = Number(b.experienceYears);
  if (!Number.isInteger(years) || years < 0 || years > 50) return NextResponse.json({ ok: false, error: "Please enter your years of experience." }, { status: 400 });
  const tier = tierForYears(years);
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "Please enter a valid 10-digit mobile number." }, { status: 400 });

  // A few unpaid attempts per person at most.
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  const { count } = await db.from("resume_orders").select("id", { count: "exact", head: true }).eq("status", "pending_payment").gte("created_at", since).or(`email.eq.${email},phone.eq.${phone}`);
  if ((count ?? 0) >= 3) return NextResponse.json({ ok: false, error: "Please finish your earlier payment or try again in a few minutes." }, { status: 429 });

  const t = TIERS[tier];
  const { data: row, error } = await db
    .from("resume_orders")
    .insert({ tier, experience_years: years, amount_inr: t.price, name, email, phone, intake_token: newToken(), source: str("src", 60) || null })
    .select("id")
    .single();
  if (error || !row) return NextResponse.json({ ok: false, error: "Couldn't start your order. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true, orderRef: row.id, amountInr: t.price, title: t.label });
}
