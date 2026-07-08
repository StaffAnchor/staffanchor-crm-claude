import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateAiPassportForCandidate } from "@/lib/ai-passport";

// Client-triggered AI passport generation. Two authorization paths, since
// there are two client-facing surfaces:
//  (a) the no-login shortlist link (/shortlist/[token]) -- authorized by a
//      valid, unexpired shortlist token whose mandate actually includes this
//      candidate in its shortlist.
//  (b) the logged-in client portal on jobs.staffanchor.com -- a different
//      app/origin, authorized by the client's own Supabase session JWT sent
//      as a Bearer token, verified against client_users + that client's
//      shortlisted mandates.
// Either way, the actual generation runs against a service-role client
// (candidates writes are staff-only under RLS), only after authorization
// above succeeds against an anon-key-scoped check.

const ALLOWED_ORIGINS = ["https://jobs.staffanchor.com", "http://localhost:3000"];

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json(
      { error: "This feature isn't fully configured yet (missing SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503, headers }
    );
  }

  const { candidateId, token } = await req.json();
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400, headers });
  }

  const anon = createSupabaseClient(supabaseUrl, anonKey);
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  let authorized = false;

  if (token) {
    // Path (a): no-login shortlist link.
    const { data: shortlistRows, error: shortlistError } = await anon.rpc("get_client_shortlist", {
      p_token: token,
    });
    if (!shortlistError && shortlistRows) {
      authorized = (shortlistRows as { candidate_id: string }[]).some((r) => r.candidate_id === candidateId);
    }
  } else {
    // Path (b): logged-in client portal, cross-origin bearer token.
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");
    if (bearerToken) {
      const {
        data: { user },
      } = await anon.auth.getUser(bearerToken);
      if (user) {
        const { data: clientUser } = await admin.from("client_users").select("client_id").eq("id", user.id).single();
        if (clientUser) {
          const { data: link } = await admin
            .from("candidate_mandate_links")
            .select("id, mandates!inner(client_id)")
            .eq("candidate_id", candidateId)
            .eq("in_shortlist", true)
            .eq("mandates.client_id", clientUser.client_id)
            .limit(1)
            .maybeSingle();
          authorized = !!link;
        }
      }
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { error: "This candidate isn't in a shortlist you have access to." },
      { status: 403, headers }
    );
  }

  const result = await generateAiPassportForCandidate(candidateId, admin, {
    note: token ? "client_generated_via_shortlist_link" : "client_generated_via_portal",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers });
  }
  return NextResponse.json({ summary: result.summary, passport: result.passport }, { headers });
}
