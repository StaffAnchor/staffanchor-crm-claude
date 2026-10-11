// StaffAnchor works in India, so every date and time in the app is Indian Standard Time. Vercel's
// servers run in UTC, which made server-rendered dates, "Today / This week" counts and similar
// boundaries come out in UTC. Setting the process time zone once, when the server starts, fixes all of
// them. (Stored timestamps stay in UTC in the database; only how they are shown and bucketed changes.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === undefined) {
    process.env.TZ = "Asia/Kolkata";
  }
}
