import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Short link used in outreach emails: clients.staffanchor.com/u/<id> opens that person's profile
// form on the jobs site with their name and email filled in, so the email itself stays clean.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const base = "https://jobs.staffanchor.com/register";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(base, 302);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.redirect(base, 302);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const { data } = await admin.from("candidates").select("full_name, email").eq("id", id).maybeSingle();
  if (!data) return NextResponse.redirect(base, 302);
  const q = new URLSearchParams({ name: data.full_name ?? "", email: data.email ?? "", ref: id });
  return NextResponse.redirect(`${base}?${q.toString()}`, 302);
}
