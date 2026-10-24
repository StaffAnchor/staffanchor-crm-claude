import { NextRequest, NextResponse } from "next/server";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { adminDb } from "@/lib/pro-sessions/core";
import { KIND_LABEL, loadWaiting } from "@/lib/waiting-queue";

// One morning email listing who is waiting on a reply: employers first, then candidates on a live role.
// It is sent only when someone is waiting (a client waiting on us is the one internal email worth an inbox).
export const maxDuration = 60;

const TO = process.env.INQUIRY_ALERT_TO || "gagan@staffanchor.com";
const URL_TODAY = "https://clients.staffanchor.com/today";
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = adminDb();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });

  const items = await loadWaiting(admin);
  if (!items.length) return NextResponse.json({ ok: true, waiting: 0 });

  const age = (h: number) => (h >= 24 ? `${Math.floor(h / 24)}d` : `${h}h`);
  const list = items.slice(0, 15);
  const text = list.map((w) => `${w.name} (${KIND_LABEL[w.kind]}, ${age(w.hoursWaiting)}): ${w.preview}`).join("\n") + `\n\nOpen Today: ${URL_TODAY}`;
  const rows = list
    .map((w) => `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;"><b>${esc(w.name)}</b><br/><span style="color:#94a3b8;font-size:12px;">${esc(KIND_LABEL[w.kind])} · ${age(w.hoursWaiting)}</span></td><td style="padding:6px 0;color:#475569;">${esc(w.preview)}</td></tr>`)
    .join("");
  await sendEmail({
    to: TO,
    subject: `${items.length} waiting on you${items.some((w) => w.kind === "employer") ? " (employer included)" : ""}`,
    text,
    html: renderEmailShell({
      preheader: `${items.length} people are waiting on a reply.`,
      bodyHtml: `<p style="margin:0 0 12px;">Good morning. ${items.length} ${items.length === 1 ? "person is" : "people are"} waiting on you.</p><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">${rows}</table><p style="margin:16px 0 0;"><a href="${URL_TODAY}" style="color:#2563eb;">Open Today</a></p>`,
    }),
  });
  return NextResponse.json({ ok: true, waiting: items.length });
}

export const GET = withHeartbeat("waiting-digest", 1440, handler);
