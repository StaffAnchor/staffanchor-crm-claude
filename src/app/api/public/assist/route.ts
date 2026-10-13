import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyMessage } from "@/lib/site-assist/classify";
import { stepsFor, CLARIFY_OPTIONS } from "@/lib/site-assist/steps";
import { understoodSentence, type Entities, type Intent } from "@/lib/site-assist/rules";
import { sendEmail } from "@/lib/mail";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_LEN = 500;
const HOURLY_LIMIT = 30;
const AI_DAILY_CAP = Number(process.env.ASSIST_AI_DAILY_CAP ?? 400);
const ALERT_DAILY_CAP = 15;
const INTENTS: Intent[] = ["jobseeker", "employer", "referrer", "vendor", "status", "privacy", "other"];

// The public website message box. Anyone can call this, so it is strict: it refuses oversized or
// too-quick submissions, limits each visitor, caps the daily AI use, never returns anything but a fixed
// structure, and stores only what is needed to improve the routing.
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

const clientIp = (req: NextRequest) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
const ipHash = (ip: string) => crypto.createHash("sha256").update(`${ip}|${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 12) ?? "x"}`).digest("hex").slice(0, 24);

function originAllowed(req: NextRequest): boolean {
  const o = req.headers.get("origin");
  if (!o) return true;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://clients.staffanchor.com").replace(/\/$/, "");
  return [base, "https://clients.staffanchor.com", "http://localhost:3000", "http://localhost:3111"].includes(o);
}

const validContact = (s: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s) || /^\+?\d[\d\s-]{8,14}\d$/.test(s);

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const db = admin();
  if (!db) return NextResponse.json({ error: "Not available right now" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    message?: unknown;
    site?: unknown;
    t?: unknown;
    website?: unknown;
    intent?: unknown;
    contact?: unknown;
    entities?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "classify";
  const message = typeof body.message === "string" ? body.message.replace(/\s+/g, " ").trim().slice(0, MAX_LEN) : "";
  const site = body.site === "jobs" ? "jobs" : "main";
  const hash = ipHash(clientIp(req));

  // Bots fill hidden fields and submit instantly.
  if (typeof body.website === "string" && body.website.length > 0) return NextResponse.json({ ok: true, ignored: true });
  if (action === "classify" && typeof body.t === "number" && body.t < 700) return NextResponse.json({ error: "Please try again." }, { status: 429 });
  if (!message) return NextResponse.json({ error: "Type a message first." }, { status: 400 });

  const since = new Date(new Date().getTime() - 3_600_000).toISOString();
  const { count: recent } = await db.from("public_assist_events").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", since);
  if ((recent ?? 0) >= HOURLY_LIMIT) return NextResponse.json({ error: "Too many messages. Please try again later." }, { status: 429 });

  const entities = (body.entities && typeof body.entities === "object" ? body.entities : {}) as Entities;
  const log = (row: Record<string, unknown>) => db.from("public_assist_events").insert({ ip_hash: hash, site, message, ...row });

  if (action === "classify") {
    const dayAgo = new Date(new Date().getTime() - 86_400_000).toISOString();
    const { count: aiToday } = await db.from("public_assist_events").select("id", { count: "exact", head: true }).eq("via", "ai").gte("created_at", dayAgo);
    const result = await classifyMessage(message, site, (aiToday ?? 0) < AI_DAILY_CAP);
    await log({ kind: "understood", intent: result.intent, confidence: result.confidence, via: result.via, entities: result.entities });
    return NextResponse.json({ ok: true, result });
  }

  if (action === "correct") {
    const intent = INTENTS.includes(body.intent as Intent) ? (body.intent as Intent) : "other";
    await log({ kind: "corrected", intent, confidence: 1, via: "visitor", entities });
    return NextResponse.json({
      ok: true,
      result: {
        intent,
        confidence: 1,
        via: "visitor",
        entities,
        understood: intent === "other" ? "" : understoodSentence(intent, entities),
        sure: true,
        steps: stepsFor(intent, entities, message),
        clarify: null,
      },
      options: CLARIFY_OPTIONS,
    });
  }

  const intent = INTENTS.includes(body.intent as Intent) ? (body.intent as Intent) : "other";

  if (action === "confirm" || action === "contact") {
    const contact = action === "contact" && typeof body.contact === "string" ? body.contact.trim().slice(0, 80) : null;
    if (action === "contact" && (!contact || !validContact(contact))) return NextResponse.json({ error: "Please enter a valid email or mobile number." }, { status: 400 });

    // Staff are told about hiring enquiries the moment the visitor acts on them, with a daily cap so a
    // flood can never fill the inbox.
    let alerted = false;
    if (intent === "employer" && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      const dayAgo = new Date(new Date().getTime() - 86_400_000).toISOString();
      const { count: sentToday } = await db.from("public_assist_events").select("id", { count: "exact", head: true }).eq("alerted", true).gte("created_at", dayAgo);
      if ((sentToday ?? 0) < ALERT_DAILY_CAP) {
        try {
          const e = entities;
          const summary = [e.headcount ? `${e.headcount}` : null, e.role ?? null, e.city ? `in ${e.city}` : null].filter(Boolean).join(" ");
          const body = `A visitor on the ${site === "jobs" ? "jobs" : "main"} site wrote:\n\n"${message}"\n\nUnderstood as: hiring${summary ? `, ${summary}` : ""}.\n${contact ? `They left: ${contact}\n` : "They have not left contact details yet.\n"}\nThis came from the website message box.`;
          await sendEmail({
            to: process.env.ASSIST_ALERT_EMAIL ?? process.env.GMAIL_USER!,
            subject: `Website enquiry: hiring${summary ? ` ${summary}` : ""}${contact ? " (contact left)" : ""}`,
            text: body,
            html: `<pre style="font-family:inherit;white-space:pre-wrap">${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
            plain: true,
          });
          alerted = true;
        } catch (err) {
          console.error("[site-assist] alert email failed", err instanceof Error ? err.message : err);
        }
      }
    }
    await log({ kind: action === "contact" ? "contact" : "confirmed", intent, confidence: 1, via: "visitor", entities, contact, alerted });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
