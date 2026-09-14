import type { SupabaseClient } from "@supabase/supabase-js";

// PostgREST silently caps any .select() response at 1000 rows (the
// project's default max_rows) unless the query itself specifies a range,
// an explicit limit, or a head-only count -- there's no error, the extra
// rows just aren't in the response. That bit multiple KPI tiles/queries
// across the app once real tables crossed 1000 rows (first caught on the
// Candidates page "Total Candidates" tile going stuck at exactly 1000 --
// see commit 6e8720a). This is the same fix generalized into a shared
// helper for plain unfiltered/unordered full-table scans: page through
// with .range() in PAGE_SIZE chunks until a page comes back short (or
// MAX_ROWS is hit, as a hard backstop against an unbounded loop if
// something upstream is badly wrong).
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  select: string
): Promise<{ data: T[]; error: null } | { data: null; error: unknown }> {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}
