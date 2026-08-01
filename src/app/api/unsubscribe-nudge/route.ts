import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { verifyUnsubscribeToken } from "@/lib/nudge-auth";

// One-click unsubscribe target for the profile-nudge-sweep cron's emails.
// No auth session involved -- a candidate clicking this link from their
// inbox is never signed in to the candidate portal, so this has to work off
// the signed token alone (see src/lib/nudge-auth.ts).
function htmlPage(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>StaffAnchor</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F8FAFC;padding:48px 16px;text-align:center;color:#0F172A;">
  <div style="max-width:420px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:32px;">
    <p style="font-size:14px;line-height:1.6;">${message}</p>
  </div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const candidateId = verifyUnsubscribeToken(token);
  if (!candidateId) {
    return new NextResponse(htmlPage("This unsubscribe link is invalid or has expired."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return new NextResponse(htmlPage("Something went wrong on our end. Please try again later."), {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  const { error } = await admin.from("candidates").update({ profile_nudge_unsubscribed: true }).eq("id", candidateId);
  if (error) {
    return new NextResponse(htmlPage("Something went wrong updating your preferences. Please try again later."), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  return new NextResponse(
    htmlPage(
      "You won't receive any more profile-completion reminder emails from StaffAnchor. If you change your mind, you can always finish your profile any time -- just visit jobs.staffanchor.com."
    ),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
