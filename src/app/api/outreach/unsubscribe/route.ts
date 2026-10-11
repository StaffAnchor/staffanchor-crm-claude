import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribe } from "@/lib/outreach";

export const runtime = "nodejs";

const page = (msg: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StaffAnchor</title><body style="font-family:Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#111"><h2>${msg}</h2><p style="color:#555">You can close this page.</p></body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

// The link in outreach emails. Signed with the candidate id, so it can only unsubscribe that person.
async function handle(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(c) || !t || !verifyUnsubscribe(c, t)) return page("This link isn't valid.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return page("Something went wrong. Please reply to the email instead.");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const { error } = await admin.from("candidates").update({ email_opt_out: true }).eq("id", c);
  if (error) return page("Something went wrong. Please reply to the email instead.");
  return page("Done. We won't email you these requests again.");
}

export const GET = handle;
// Mail apps that use one-click unsubscribe POST to the same address.
export const POST = handle;
