import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  const isPasswordResetRoute =
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/auth/callback");
  const isPublicApiRoute =
    // Authorizes itself (shortlist token or client bearer JWT) rather than
    // relying on a staff cookie session -- called from the no-login
    // shortlist link and cross-origin from the client portal, neither of
    // which has a staff auth cookie to redirect-on-missing in the first
    // place.
    request.nextUrl.pathname.startsWith("/api/public-ai-summary") ||
    // Vercel Cron hits this on a schedule with a CRON_SECRET bearer token,
    // never a staff cookie -- same class of bug as public-ai-summary above,
    // caught this time before it shipped rather than after a user hit it.
    request.nextUrl.pathname.startsWith("/api/cron/") ||
    // Postgres (via pg_net, see fn_notify_new_candidate_mandate_link) calls
    // this server-to-server with a shared secret header, never a staff
    // cookie -- same class of bug as the two routes above. Missing this
    // exemption meant every one of these calls got redirected to /login
    // and came back as a 405 (POST followed onto a GET-only page), so the
    // auto-score-on-link trigger silently never worked despite being fully
    // wired -- confirmed via net._http_response showing 405 on every row.
    request.nextUrl.pathname.startsWith("/api/internal/") ||
    // Meta calls this directly (verification handshake + delivery/inbound
    // webhooks) with no staff cookie -- authorizes itself via
    // WHATSAPP_VERIFY_TOKEN on the GET handshake; same class of bug as
    // the two routes above, exempted up front this time.
    request.nextUrl.pathname.startsWith("/api/whatsapp/webhook") ||
    // Client contacts requesting/verifying a shortlist-link access code have
    // no staff cookie either -- these authorize themselves (client_contacts
    // membership check + the code itself), same class of bug again.
    /^\/api\/shortlist\/[^/]+\/(request-code|verify-code)$/.test(request.nextUrl.pathname) ||
    // Self-serve vendor signup -- authorizes itself via the vendor_agencies
    // invite_token (checked server-side in the route), not a staff cookie.
    // No account exists yet at this point, so there's nothing to redirect to.
    /^\/api\/vendor-signup\/[^/]+$/.test(request.nextUrl.pathname);
  const isPublicRoute =
    isAuthRoute ||
    isPasswordResetRoute ||
    isPublicApiRoute ||
    request.nextUrl.pathname.startsWith("/shortlist") ||
    // No-login candidate interview scheduling link (Feature 5) -- same
    // class of route as /shortlist above: authorizes itself via the
    // interview_scheduling_tokens token inside the RPCs, not a staff cookie.
    request.nextUrl.pathname.startsWith("/schedule") ||
    // Same class again: a would-be vendor has no account yet, so there's no
    // session to check -- the invite token itself is the credential.
    request.nextUrl.pathname.startsWith("/vendor-signup");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    // ROS Phase 2: Priority Actions is the true home screen post-login.
    // Freelancer accounts get redirected onward to /vendor/mandates by the
    // block below on their very next request.
    const url = request.nextUrl.clone();
    url.pathname = "/inbox";
    return NextResponse.redirect(url);
  }

  // Vendor/freelancer accounts get a separate, restricted portal (/vendor/*)
  // instead of the full internal CRM -- keep each side out of the other's
  // routes. Public routes (login, password reset, cron/webhook callbacks,
  // shortlist links) are exempt since they're not role-specific.
  if (user && !isPublicRoute) {
    const isVendorRoute = request.nextUrl.pathname.startsWith("/vendor");
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "freelancer" && !isVendorRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/vendor/mandates";
      return NextResponse.redirect(url);
    }
    if (profile?.role !== "freelancer" && isVendorRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/inbox";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
