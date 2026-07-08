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
    request.nextUrl.pathname.startsWith("/api/public-ai-summary");
  const isPublicRoute =
    isAuthRoute ||
    isPasswordResetRoute ||
    isPublicApiRoute ||
    request.nextUrl.pathname.startsWith("/shortlist");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/candidates";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
