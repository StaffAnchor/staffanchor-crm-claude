import type { SupabaseClient } from "@supabase/supabase-js";

// Google Calendar over plain REST, using the refresh token saved when the owner connects their calendar. Needs
// GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "openid",
  "email",
].join(" ");

export const googleConfigured = () => !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);

export async function getAccessToken(db: SupabaseClient): Promise<string | null> {
  if (!googleConfigured()) return null;
  const { data } = await db.from("google_calendar_connection").select("refresh_token").eq("id", 1).maybeSingle();
  if (!data?.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ refresh_token?: string; id_token?: string } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { refresh_token?: string; id_token?: string };
}

/** Busy periods across every calendar the owner can see (Topmate and other calendars included), holidays excluded. */
export async function busyPeriods(token: string, timeMin: Date, timeMax: Date): Promise<{ start: Date; end: Date }[] | null> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const list = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50", { headers, cache: "no-store" });
  if (!list.ok) return null;
  const cals = ((await list.json()) as { items?: { id: string; selected?: boolean }[] }).items ?? [];
  const ids = cals.filter((c) => c.selected !== false && !/#holiday@/.test(c.id)).map((c) => ({ id: c.id }));
  if (ids.length === 0) ids.push({ id: "primary" });
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers,
    body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: ids }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  const out: { start: Date; end: Date }[] = [];
  for (const c of Object.values(json.calendars ?? {})) for (const b of c.busy ?? []) out.push({ start: new Date(b.start), end: new Date(b.end) });
  return out;
}

export async function createMeetEvent(
  token: string,
  e: { summary: string; description: string; start: Date; end: Date; attendeeEmail: string; requestId: string }
): Promise<{ id: string; meetLink: string | null } | null> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: e.summary,
      description: e.description,
      start: { dateTime: e.start.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: e.end.toISOString(), timeZone: "Asia/Kolkata" },
      attendees: [{ email: e.attendeeEmail }],
      conferenceData: { createRequest: { requestId: e.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      reminders: { useDefault: true },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id: string; hangoutLink?: string };
  return { id: json.id, meetLink: json.hangoutLink ?? null };
}
