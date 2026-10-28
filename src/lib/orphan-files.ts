import type { SupabaseClient } from "@supabase/supabase-js";

export type OrphanFile = {
  path: string;
  file: string;
  size_bytes: number;
  uploaded_at: string;
  kind: "duplicate_file" | "name_match" | "unknown";
  match_candidate_id: string | null;
  match_name: string | null;
  match_has_cv: boolean;
};

export async function listOrphanFiles(admin: SupabaseClient, paths?: string[]): Promise<OrphanFile[]> {
  const q = admin.rpc("orphan_resume_files");
  // Asked for specific files, the database filters them itself; the unfiltered list is capped at the API's row limit.
  const { data } = await (paths ? q.in("path", paths) : q);
  return ((data ?? []) as OrphanFile[]).map((r) => ({ ...r, size_bytes: Number(r.size_bytes) }));
}

/** Which of these paths are still unattached and older than a day, according to the database. */
export async function stillOrphaned(admin: SupabaseClient, paths: string[]): Promise<Set<string>> {
  const all = await listOrphanFiles(admin, paths);
  const want = new Set(paths);
  return new Set(all.filter((f) => want.has(f.path)).map((f) => f.path));
}

export const KIND_LABEL: Record<OrphanFile["kind"], string> = {
  duplicate_file: "Same file is already on a profile",
  name_match: "Name matches a profile",
  unknown: "Unknown, needs a look",
};
