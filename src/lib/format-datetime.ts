// Every rendered time in the app used bare `.toLocaleString()`/`.toLocaleTimeString()`
// with no timezone label (gap identified in the July 2026 audit, task #675).
// StaffAnchor's recruiters, clients, and vendors are virtually all IST, but a
// bare "2:30 PM" is ambiguous the moment any party is elsewhere -- vendors in
// particular are external freelancers who may not be in India. This forces the
// IST label onto every formatted date/time so nobody has to guess the timezone.
//
// We deliberately format in Asia/Kolkata regardless of the viewer's local
// timezone, since every stored timestamp represents a real-world IST slot
// (interview time, schedule slot, etc.) agreed upon in that timezone.
export function formatDateTimeIST(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";

  const formatted = d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatted} IST`;
}

export function formatTimeIST(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";

  const formatted = d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatted} IST`;
}

export function formatDateIST(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
