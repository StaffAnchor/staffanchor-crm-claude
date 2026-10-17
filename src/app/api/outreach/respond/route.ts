import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySigned } from "@/lib/outreach";

export const runtime = "nodejs";

const page = (msg: string, sub = "You can close this page.") =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StaffAnchor</title><body style="font-family:Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#111"><h2>${msg}</h2><p style="color:#555">${sub}</p>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

// The one-tap answer in the "are you open to hearing about roles?" email. Signed for one person and one purpose.
// "Yes" marks them open and it ranks them higher for matching roles; "Not right now" rests them for 90 days.
async function handle(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const a = req.nextUrl.searchParams.get("a");
  if (!/^[0-9a-f-]{36}$/i.test(c) || !t || !verifySigned(c, "respond", t) || (a !== "open" && a !== "not_now")) return page("This link isn't valid.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return page("Something went wrong. Please reply to the email instead.");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const patch = a === "open" ? { open_to_work_at: new Date().toISOString(), not_now_until: null } : { not_now_until: new Date(Date.now() + 90 * 86_400_000).toISOString() };
  const { error } = await admin.from("candidates").update(patch).eq("id", c);
  if (error) return page("Something went wrong. Please reply to the email instead.");
  return a === "open"
    ? page("Thank you. We'll be in touch when a good role comes up.", "Want to make sure we have your latest details? You can update them on your profile.")
    : page("No problem. We'll leave you for now.");
}

export const GET = handle;
export const POST = handle;
