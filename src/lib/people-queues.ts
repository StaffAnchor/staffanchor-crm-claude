// The work queues at the top of the People page.
export type Queue = "call" | "new" | "fits" | "gaps";

export const asQueue = (v: string | undefined): Queue | null => (v === "call" || v === "new" || v === "fits" || v === "gaps" ? v : null);

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const GAPS_FILTER = "resume_file_url.is.null,current_fixed_ctc.is.null,current_fixed_ctc.eq.0";
