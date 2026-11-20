import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { CRM_STAFF_ROLES } from "@/lib/is-staff-viewer";
import { parseIntent } from "@/lib/anchor/intents";
import { findTargets, loadFees, loadPlaced } from "@/lib/anchor/data";
import { billingLine, loadDropped } from "@/lib/placements/drops";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Anchor's quick answers. Open to everyone on the CRM team; fees are admin only. Anything open-ended is handed back to the
// browser with kind "agent", which only admins may continue (the AI assistant can prepare actions, so it stays admin only).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role as string | undefined;
  if (!role || !(CRM_STAFF_ROLES as readonly string[]).includes(role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const isAdmin = role === "admin";

  const b = (await req.json().catch(() => ({}))) as { q?: string };
  const q = (b.q ?? "").trim().slice(0, 400);
  if (!q) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  const intent = parseIntent(q);

  if (intent.kind === "placements") {
    const r = await loadPlaced(supabase, intent.range);
    return NextResponse.json({ kind: "placements", range: intent.range, counts: r.counts, total: r.rows.length, rows: r.rows.slice(0, 25) });
  }

  if (intent.kind === "dropped") {
    const rows = await loadDropped(supabase, adminDb(), isAdmin);
    return NextResponse.json({
      kind: "dropped",
      total: rows.length,
      rows: rows.slice(0, 15).map((r) => ({ linkId: r.linkId, candidateId: r.candidateId, mandateId: r.mandateId, candidate: r.candidate, client: r.client, role: r.role, joined: r.joined, droppedOn: r.droppedOn, daysIn: r.daysIn, reason: r.reason, billing: billingLine(r) })),
    });
  }

  if (intent.kind === "fees") {
    if (!isAdmin) return NextResponse.json({ kind: "denied", text: "Fees are visible to admins only. I can show you placements instead: try “placed in the last 30 days”." });
    const admin = adminDb();
    if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
    const f = await loadFees(admin, intent.range);
    return NextResponse.json({ kind: "fees", range: intent.range, collected: f.collected, collectedCount: f.collectedCount, outstanding: f.outstanding, outstandingCount: f.outstandingCount, overdueCount: f.overdueCount, estimatedCount: f.estimatedCount, byClient: f.byClient.slice(0, 6) });
  }

  if (intent.kind === "go") {
    const matches = await findTargets(supabase, intent.q, intent.type);
    if (matches.length) return NextResponse.json({ kind: "go", q: intent.q, matches });
    if (intent.explicit || !isAdmin) return NextResponse.json({ kind: "nomatch", q: intent.q });
    return NextResponse.json({ kind: "agent", allowed: true });
  }

  return NextResponse.json({ kind: "agent", allowed: isAdmin });
}
