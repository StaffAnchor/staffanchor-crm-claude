import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitize, type CvData } from "../cv-brief/config";
import { COLUMNS as BRIEF_COLUMNS, type BriefRow } from "../cv-brief/store";
import { buildDraft } from "./build";
import { polishDraft } from "./polish";
import { sanitizeDoc, type CandidateResponse, type CvDoc, type DocStatus } from "./types";
import type { Photo } from "./pdf";

export type DocRow = {
  id: string; brief_id: string; version: number; status: DocStatus; content: unknown; polish_note: string | null; review_token: string | null;
  created_at: string; updated_at: string; approved_by: string | null; approved_at: string | null; shared_at: string | null; shared_to: string | null;
  response: CandidateResponse | null; responded_at: string | null;
};

export const DOC_COLUMNS = "id, brief_id, version, status, content, polish_note, review_token, created_at, updated_at, approved_by, approved_at, shared_at, shared_to, response, responded_at";

export const validReviewToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{64}$/.test(t);

export const reviewLink = (token: string) => `${process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com"}/edge/cv-review/${token}`;

export async function loadBrief(db: SupabaseClient, briefId: string): Promise<{ brief: BriefRow; data: CvData } | null> {
  const { data: b } = await db.from("cv_briefs").select(BRIEF_COLUMNS).eq("id", briefId).maybeSingle();
  if (!b) return null;
  return { brief: b as BriefRow, data: sanitize((b as BriefRow).data) };
}

/** The candidate's photo as bytes for the PDF and Word file. WebP is not supported by either, so it is left out. */
export async function loadPhoto(db: SupabaseClient, photoPath: string | null): Promise<Photo> {
  if (!photoPath) return null;
  const ext = photoPath.split(".").pop()?.toLowerCase();
  if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") return null;
  const { data } = await db.storage.from("resume-orders").download(photoPath);
  if (!data) return null;
  return { data: Buffer.from(await data.arrayBuffer()), format: ext === "png" ? "png" : "jpg" };
}

/** Writes the first draft from the form answers (optionally reworded by the AI, with every figure checked), as the next version. */
export async function createDraft(db: SupabaseClient, briefId: string, userId: string | null, polish: boolean): Promise<DocRow | null> {
  const loaded = await loadBrief(db, briefId);
  if (!loaded) return null;
  let doc: CvDoc = buildDraft(loaded.data, !!loaded.brief.photo_path);
  let note = "Plain draft, written only from the candidate's answers.";
  if (polish) {
    const r = await polishDraft(doc, loaded.data);
    doc = r.doc;
    note = r.note;
  }
  return insertVersion(db, briefId, userId, doc, note);
}

export async function insertVersion(db: SupabaseClient, briefId: string, userId: string | null, doc: CvDoc, note: string | null): Promise<DocRow | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await db.from("cv_docs").select("version").eq("brief_id", briefId).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db.from("cv_docs").insert({ brief_id: briefId, version: (last?.version ?? 0) + 1, content: sanitizeDoc(doc), polish_note: note, created_by: userId }).select(DOC_COLUMNS).single();
    if (!error) return data as DocRow;
  }
  return null;
}

export async function newVersionFrom(db: SupabaseClient, docId: string, userId: string | null): Promise<DocRow | null> {
  const { data: src } = await db.from("cv_docs").select(DOC_COLUMNS).eq("id", docId).maybeSingle();
  if (!src) return null;
  const row = src as DocRow;
  const note = row.response?.decision === "changes" ? `Started from version ${row.version} after the candidate asked for changes.` : `Copied from version ${row.version}.`;
  return insertVersion(db, row.brief_id, userId, sanitizeDoc(row.content), note);
}
