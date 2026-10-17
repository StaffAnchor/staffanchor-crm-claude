import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { askMissingDetails, planAsk, previewAsk, type SkipReason } from "@/lib/ask-missing";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PER_CALL = 20;
const GAP_MS = 700;

// Asks several candidates for their missing details on WhatsApp. A person presses the button; with
// `dryRun` it only reports what would happen (how many free chats, how many charged templates, who is
// skipped and why) so the cost is visible before anything is sent. Email is not used here: the Outreach
// page already sends emails in paced batches.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { candidateIds?: unknown; dryRun?: unknown };
  const ids = (Array.isArray(body.candidateIds) ? body.candidateIds : []).filter((x): x is string => typeof x === "string");
  const dryRun = body.dryRun === true;
  if (ids.length === 0) return NextResponse.json({ error: "Choose at least one candidate." }, { status: 400 });
  const batch = ids.slice(0, MAX_PER_CALL);

  const skipped: Partial<Record<SkipReason, number>> = {};
  const bump = (r: SkipReason | undefined) => {
    const k = r ?? "no_phone";
    skipped[k] = (skipped[k] ?? 0) + 1;
  };

  if (dryRun) {
    let window = 0;
    let template = 0;
    // Each eligible person's exact message, so it can be read (and the person left out) before anything is sent.
    const recipients: { id: string; name: string; route: string; message: string }[] = [];
    for (const id of batch) {
      const p = await planAsk(admin, id);
      if (p.ok) {
        if (p.plan === "window") window++;
        else template++;
        const pv = await previewAsk(admin, id);
        recipients.push({ id, name: p.cand?.full_name ?? "Unnamed", route: p.plan, message: pv.ok ? pv.preview.messages.join("\n\n") : "" });
      } else bump(p.skip);
    }
    return NextResponse.json({ ok: true, dryRun: true, considered: batch.length, over: Math.max(0, ids.length - batch.length), window, template, skipped, recipients });
  }

  let sentWindow = 0;
  let sentTemplate = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const id of batch) {
    const r = await askMissingDetails(admin, user.id, id, { emailFallback: false });
    if (r.ok) {
      if (r.via === "whatsapp_template") sentTemplate++;
      else sentWindow++;
    } else if (r.skip) bump(r.skip);
    else {
      failed++;
      firstError = firstError ?? r.error;
    }
    await new Promise((res) => setTimeout(res, GAP_MS));
  }
  return NextResponse.json({ ok: true, considered: batch.length, over: Math.max(0, ids.length - batch.length), sentWindow, sentTemplate, failed, skipped, error: firstError });
}
