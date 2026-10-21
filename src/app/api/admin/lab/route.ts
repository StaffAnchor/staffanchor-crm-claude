import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb, EMAIL_RE, PRO_FROM } from "@/lib/pro-sessions/core";
import { SESSION_TITLES } from "@/lib/lab/data";
import { sendEmail, renderEmailShell } from "@/lib/mail";

export const dynamic = "force-dynamic";
const ROLES = ["manager", "sales_head", "management", "facilitator"];
const PORTAL = "https://clients.staffanchor.com/lab";

// Everything the facilitator does to a cohort, one action at a time. Admin only.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string, max = 200) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });

  switch (b.action) {
    case "create_cohort": {
      const company = s("company"), name = s("name") || "Sales Leaders Lab";
      if (company.length < 2) return bad("Enter the company name.");
      const { data: client } = await db.from("clients").select("id").ilike("name", company).limit(1).maybeSingle();
      const { data: row, error } = await db.from("lab_cohorts").insert({ company_name: company, name, start_date: s("startDate") || null, client_id: client?.id ?? null }).select("id").single();
      if (error || !row) return bad("Couldn't create the cohort.");
      await db.from("lab_sessions").insert(SESSION_TITLES.map((title, i) => ({ cohort_id: row.id, n: i + 1, title })));
      // The admin who creates a cohort is its facilitator, so they can sign in at /lab and see it as the
      // stakeholders do (manager-wise and overall), as well as from the CRM.
      const { data: me } = await db.from("profiles").select("email, full_name").eq("id", auth.userId).maybeSingle();
      if (me?.email) await db.from("lab_members").insert({ cohort_id: row.id, email: me.email.toLowerCase(), full_name: me.full_name ?? null, role: "facilitator" });
      return NextResponse.json({ ok: true, id: row.id });
    }
    case "add_member": {
      const email = s("email").toLowerCase(), cohortId = s("cohortId"), role = s("role");
      if (!EMAIL_RE.test(email)) return bad("Enter a valid email.");
      if (!ROLES.includes(role)) return bad("Pick a role.");
      const { data: row, error } = await db.from("lab_members").insert({ cohort_id: cohortId, email, full_name: s("fullName") || null, role, reports_to: s("reportsTo") || null }).select("id").single();
      if (error) return bad(error.code === "23505" ? "That email is already in this cohort." : "Couldn't add the person.");
      return NextResponse.json({ ok: true, id: row.id });
    }
    case "update_member": {
      const patch: Record<string, unknown> = {};
      if (ROLES.includes(s("role"))) patch.role = s("role");
      if ("reportsTo" in b) patch.reports_to = s("reportsTo") || null;
      if ("fullName" in b) patch.full_name = s("fullName") || null;
      await db.from("lab_members").update(patch).eq("id", s("memberId"));
      return NextResponse.json({ ok: true });
    }
    case "remove_member": {
      await db.from("lab_members").update({ active: false }).eq("id", s("memberId"));
      return NextResponse.json({ ok: true });
    }
    case "set_session_date": {
      await db.from("lab_sessions").update({ held_on: s("heldOn") || null }).eq("id", s("sessionId"));
      return NextResponse.json({ ok: true });
    }
    case "set_attendance": {
      const present = b.present === true;
      await db.from("lab_attendance").upsert({ session_id: s("sessionId"), member_id: s("memberId"), present }, { onConflict: "session_id,member_id" });
      return NextResponse.json({ ok: true });
    }
    case "invite": {
      const ids = Array.isArray(b.memberIds) ? (b.memberIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const { data: people } = await db.from("lab_members").select("id, email, full_name, role, cohort_id, lab_cohorts(company_name, name)").in("id", ids).eq("active", true);
      let sent = 0;
      for (const p of (people ?? []) as unknown as { id: string; email: string; full_name: string | null; role: string; lab_cohorts: { company_name: string; name: string } | null }[]) {
        const first = (p.full_name ?? "").split(/\s+/)[0] || "there";
        const what = p.role === "manager" ? "Sign in to add your details, use the toolkit and see your progress." : "Sign in to see how the cohort is progressing, including each manager's progress.";
        try {
          await sendEmail({
            to: p.email,
            subject: `Your access to ${p.lab_cohorts?.name ?? "Sales Leaders Lab"} | ${p.lab_cohorts?.company_name ?? ""}`.trim(),
            text: `Hi ${first},\n\nYou have been added to ${p.lab_cohorts?.name ?? "Sales Leaders Lab"} for ${p.lab_cohorts?.company_name ?? "your company"}.\n\n${what}\n\nSign in here with this email address. We send a 6-digit code, so there is no password to remember:\n${PORTAL}\n\nRegards,\nGagan Sharma\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 7273000088`,
            html: renderEmailShell({ preheader: "Your Sales Leaders Lab access", bodyHtml: `<p>Hi ${first},</p><p>You have been added to <strong>${p.lab_cohorts?.name ?? "Sales Leaders Lab"}</strong> for ${p.lab_cohorts?.company_name ?? "your company"}.</p><p>${what}</p><p><a href="${PORTAL}">Sign in here</a> with this email address. We send a 6-digit code, so there is no password to remember.</p><p>Regards,<br/>Gagan Sharma<br/>StaffAnchor Talent Solutions<br/>info@staffanchor.com | 7273000088</p>` }),
            fromName: "StaffAnchor",
            fromEmail: PRO_FROM,
            replyTo: PRO_FROM,
          });
          await db.from("lab_members").update({ invited_at: new Date().toISOString() }).eq("id", p.id);
          sent++;
        } catch (e) {
          console.error("lab invite failed", e);
        }
      }
      return NextResponse.json({ ok: true, sent });
    }
    default:
      return bad("Unknown action.");
  }
}
