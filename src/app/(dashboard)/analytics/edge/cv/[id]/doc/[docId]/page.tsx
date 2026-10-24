import { notFound } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { formatMetric, jobFilled, type Job } from "@/lib/cv-brief/config";
import { checkDoc } from "@/lib/cv-doc/checks";
import { shareDefault } from "@/lib/cv-doc/mail";
import { DOC_COLUMNS, loadBrief, reviewLink, type DocRow } from "@/lib/cv-doc/store";
import { sanitizeDoc } from "@/lib/cv-doc/types";
import DocEditor from "./editor";

export const dynamic = "force-dynamic";

// What the candidate told us about a job, in their own terms, shown next to the CV lines so each figure can be checked at a glance.
function sourceLines(j: Job): string[] {
  const out: string[] = [];
  for (const m of j.metrics) if (m.amount !== null || m.range) out.push(`${m.label}: ${formatMetric(m)}`);
  const t = j.team;
  if (t.direct !== null) out.push(`Direct reports: ${t.direct}`);
  if (t.total !== null) out.push(`Whole team: ${t.total}`);
  if (t.hired) out.push(`Hired: ${t.hired}`);
  if (t.attrition) out.push(`Attrition: ${t.attrition}`);
  if (j.growth.from || j.growth.to) out.push(`Growth: ${[j.growth.from, j.growth.to].filter(Boolean).join(" to ")}${j.growth.period ? ` in ${j.growth.period}` : ""}`);
  for (const w of j.wins) if (w.text.trim()) out.push(`Achievement: ${w.text}`);
  if (j.promoted) out.push(`Promotions or awards: ${j.promoted}`);
  return out;
}

export default async function DocPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(docId)) notFound();
  const { data } = await db.from("cv_docs").select(DOC_COLUMNS).eq("id", docId).eq("brief_id", id).maybeSingle();
  if (!data) notFound();
  const row = data as DocRow;
  const loaded = await loadBrief(db, id);
  if (!loaded) notFound();
  const content = sanitizeDoc(row.content);
  const { data: vs } = await db.from("cv_docs").select("id, version, status").eq("brief_id", id).order("version", { ascending: false });
  const sources: Record<string, string[]> = {};
  for (const j of loaded.data.jobs.filter(jobFilled)) sources[j.id] = sourceLines(j);
  const to = (loaded.brief.email ?? loaded.data.basics.email ?? "").trim();
  return (
    <DocEditor
      briefId={id}
      docId={row.id}
      name={loaded.brief.name}
      version={row.version}
      status={row.status}
      initial={content}
      initialFlags={checkDoc(content, loaded.data, !!loaded.brief.photo_path)}
      polishNote={row.polish_note}
      versions={(vs ?? []) as { id: string; version: number; status: DocRow["status"] }[]}
      sources={sources}
      to={to}
      shareMessage={shareDefault()}
      reviewUrl={row.review_token ? reviewLink(row.review_token) : null}
      sharedTo={row.shared_to}
      sharedAt={row.shared_at}
      approvedBy={row.approved_by}
      response={row.response}
      hasPhoto={!!loaded.brief.photo_path}
      photoPref={loaded.data.extras.photoPref}
    />
  );
}
