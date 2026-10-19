import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseGstin } from "@/lib/gst";

// Looks a GSTIN up with Appyflow (a GST data service) so legal name and
// registered address don't have to be typed. Needs GST_LOOKUP_KEY. The result
// is only returned for the admin to confirm; nothing is saved here.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const parsed = parseGstin(req.nextUrl.searchParams.get("gstin") ?? "");
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const key = process.env.GST_LOOKUP_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "Online lookup isn't switched on yet (no GST_LOOKUP_KEY). State and PAN are still filled in from the number." }, { status: 501 });
  }

  try {
    const res = await fetch(`https://appyflow.in/api/verifyGST?gstNo=${parsed.gstin}&key_secret=${encodeURIComponent(key)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const json = (await res.json()) as {
      error?: boolean;
      message?: string;
      taxpayerInfo?: {
        lgnm?: string;
        tradeNam?: string;
        sts?: string;
        pradr?: { adr?: string; addr?: Record<string, string> };
      };
    };
    // Free/sandbox keys return a made-up taxpayer with a note about paid
    // credits -- never show that as a real client's details.
    if (/credit|sandbox/i.test(json.message ?? "")) {
      return NextResponse.json(
        { ok: false, error: "The GST lookup key is on test credits, which return dummy data. Buy credits at Appyflow to switch on real lookups." },
        { status: 402 }
      );
    }
    if (json.error || !json.taxpayerInfo) {
      return NextResponse.json({ ok: false, error: json.message || "GSTIN not found" }, { status: 404 });
    }
    const t = json.taxpayerInfo;
    const a = t.pradr?.addr ?? {};
    const address =
      t.pradr?.adr ||
      [a.bno, a.flno, a.bnm, a.st, a.loc, a.dst, a.stcd, a.pncd].filter(Boolean).join(", ");
    return NextResponse.json({
      ok: true,
      gstin: parsed.gstin,
      stateCode: parsed.stateCode,
      stateName: parsed.stateName,
      legalName: t.lgnm ?? null,
      tradeName: t.tradeNam ?? null,
      status: t.sts ?? null,
      address: address || null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "The GST lookup service didn't respond. Try again, or type the details." }, { status: 502 });
  }
}
