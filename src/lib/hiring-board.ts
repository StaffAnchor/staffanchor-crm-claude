import type { SupabaseClient } from "@supabase/supabase-js";

// The hiring board: several open roles side by side, with every candidate the matcher likes for any of them,
// scored per role, so one person can be put forward for the role they fit best (or for all of them) in one go.

export type BoardRole = { id: string; title: string; client: string; city: string; headcount: number; inPipeline: number };
export type BoardCell = { score: number; fit: "strong" | "possible"; inPipelineStage: string | null };
export type BoardCandidate = {
  id: string;
  name: string;
  headline: string;
  city: string;
  years: number | null;
  ctc: string;
  notice: string;
  hasCv: boolean;
  cells: Record<string, BoardCell>;
  bestRoleId: string;
  bestScore: number;
};
export type Board = { roles: BoardRole[]; candidates: BoardCandidate[] };

export type OpenRole = { id: string; title: string; client: string; city: string; headcount: number; inPipeline: number; suggestions: number };

export async function loadOpenRoles(supabase: SupabaseClient): Promise<OpenRole[]> {
  const { data: ms } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, city, headcount")
    .eq("status", "open")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(60);
  const ids = (ms ?? []).map((m) => m.id as string);
  if (!ids.length) return [];
  const [{ data: links }, { data: ai }] = await Promise.all([
    supabase.from("candidate_mandate_links").select("mandate_id").in("mandate_id", ids).neq("stage", "rejected"),
    supabase.from("mandate_ai_matches").select("mandate_id").in("mandate_id", ids).in("fit", ["strong", "possible"]).eq("status", "suggested"),
  ]);
  const count = (rows: { mandate_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.mandate_id, (m.get(r.mandate_id) ?? 0) + 1);
    return m;
  };
  const pipe = count(links as { mandate_id: string }[] | null);
  const sug = count(ai as { mandate_id: string }[] | null);
  return (ms ?? []).map((m) => ({
    id: m.id as string,
    title: ((m.role_title as string) ?? "").trim(),
    client: (m.client_name as string) ?? "",
    city: (m.city as string) ?? "",
    headcount: Number(m.headcount ?? 1),
    inPipeline: pipe.get(m.id as string) ?? 0,
    suggestions: sug.get(m.id as string) ?? 0,
  }));
}

export async function loadBoard(supabase: SupabaseClient, mandateIds: string[], limit = 60): Promise<Board> {
  const open = await loadOpenRoles(supabase);
  const roles: BoardRole[] = mandateIds
    .map((id) => open.find((r) => r.id === id))
    .filter((r): r is OpenRole => !!r)
    .map((r) => ({ id: r.id, title: r.title, client: r.client, city: r.city, headcount: r.headcount, inPipeline: r.inPipeline }));
  const ids = roles.map((r) => r.id);
  if (!ids.length) return { roles, candidates: [] };

  const [{ data: ai }, { data: links }] = await Promise.all([
    supabase.from("mandate_ai_matches").select("mandate_id, candidate_id, fit, score").in("mandate_id", ids).in("fit", ["strong", "possible"]).in("status", ["suggested", "added"]),
    supabase.from("candidate_mandate_links").select("mandate_id, candidate_id, stage, match_score").in("mandate_id", ids),
  ]);

  const cells = new Map<string, Record<string, BoardCell>>();
  const put = (cid: string, mid: string, cell: BoardCell) => {
    const row = cells.get(cid) ?? {};
    const old = row[mid];
    row[mid] = old ? { ...old, score: Math.max(old.score, cell.score), inPipelineStage: cell.inPipelineStage ?? old.inPipelineStage } : cell;
    cells.set(cid, row);
  };
  for (const a of ai ?? []) put(a.candidate_id as string, a.mandate_id as string, { score: Number(a.score ?? 0), fit: a.fit === "strong" ? "strong" : "possible", inPipelineStage: null });
  for (const l of links ?? []) {
    if (!cells.has(l.candidate_id as string)) continue; // only people the matcher surfaced; the role page already shows its own pipeline
    const score = Number(l.match_score ?? 0);
    put(l.candidate_id as string, l.mandate_id as string, { score, fit: score >= 68 ? "strong" : "possible", inPipelineStage: l.stage as string });
  }

  const ranked = [...cells.entries()]
    .map(([cid, row]) => {
      const best = Object.entries(row).sort((a, b) => b[1].score - a[1].score)[0];
      return { cid, row, bestRoleId: best[0], bestScore: best[1].score };
    })
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, limit);
  if (!ranked.length) return { roles, candidates: [] };

  const { data: cs } = await supabase
    .from("candidates")
    .select("id, full_name, current_job_title, current_employer, city_canonical, current_location, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, resume_file_url")
    .in("id", ranked.map((r) => r.cid));
  const byId = new Map((cs ?? []).map((c) => [c.id as string, c]));
  const candidates: BoardCandidate[] = [];
  for (const r of ranked) {
    const c = byId.get(r.cid);
    if (!c) continue;
    const title = (c.current_job_title as string) ?? "";
    const emp = (c.current_employer as string) ?? "";
    candidates.push({
      id: r.cid,
      name: (c.full_name as string) ?? "Unnamed",
      headline: [title, emp].filter(Boolean).join(" at "),
      city: (c.city_canonical as string) || (c.current_location as string) || "",
      years: c.total_experience_years != null ? Number(c.total_experience_years) : null,
      ctc: c.current_fixed_ctc != null ? `${c.current_fixed_ctc}${c.expected_fixed_ctc != null ? ` → ${c.expected_fixed_ctc}` : ""} LPA` : "",
      notice: (c.notice_period as string) ?? "",
      hasCv: !!c.resume_file_url,
      cells: r.row,
      bestRoleId: r.bestRoleId,
      bestScore: r.bestScore,
    });
  }
  return { roles, candidates };
}
