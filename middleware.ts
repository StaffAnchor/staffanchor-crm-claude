import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // The Sales Circle referrer marketing + application page moved off the
  // CRM to the marketing site (staffanchor.com/sales-circle) -- it's an
  // external opportunity page, not a CRM feature, and belongs on the
  // public-facing domain rather than clients.staffanchor.com. Redirect the
  // old URL so any links already shared (or indexed) still land somewhere
  // real, rather than a 404 or a now-stale in-CRM form. The submission API
  // route itself (api/referrer-apply) stays here and is now called
  // cross-origin from that page -- only the page redirects.
  if (request.nextUrl.pathname === "/referrer-apply") {
    return NextResponse.redirect("https://www.staffanchor.com/sales-circle", 308);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
