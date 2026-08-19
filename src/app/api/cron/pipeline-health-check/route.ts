import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { computeHealthSnapshot } from "@/lib/pipeline-health";
import { sendEmail, renderEmailShell } from "@/lib/mail";

// Runs after every other cron in the day's schedule (see vercel.json) so
// cron_heartbeats has a fresh picture, snapshots system-wide AI coverage +
// cron freshness into pipeline_health_snapshots, and emails the admin only
// when something is actually flagged -- not a daily "all clear" spam.
export const maxDuration = 30;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  try {
    const { metrics, alerts } = await computeHealthSnapshot(admin);

    await admin.from("pipeline_health_snapshots").insert({
      metrics,
      alerts,
    });

    const criticalAlerts = alerts.filter((a) => a.severity === "critical");
    if (criticalAlerts.length > 0) {
      const adminEmail = process.env.SYSTEM_ALERT_EMAIL || process.env.GMAIL_USER;
      if (adminEmail) {
        try {
          await sendEmail({
            to: adminEmail,
            subject: `StaffAnchor CRM: ${criticalAlerts.length} pipeline alert${criticalAlerts.length > 1 ? "s" : ""}`,
            html: renderEmailShell({
              preheader: `${criticalAlerts.length} pipeline alert${criticalAlerts.length > 1 ? "s" : ""} need attention`,
              bodyHtml: `
                <p>The automated pipeline health check found ${criticalAlerts.length} issue(s) that likely need attention:</p>
                <ul>${criticalAlerts.map((a) => `<li><strong>${a.area}</strong>: ${a.message}</li>`).join("")}</ul>
                <p>See Reports &gt; System Health in the CRM for the full picture.</p>
              `,
            }),
          });
        } catch (mailErr) {
          console.error("[pipeline-health-check] alert email failed", mailErr);
        }
      }
    }

    return NextResponse.json({ ok: true, metrics, alerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/pipeline-health-check] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handler;
