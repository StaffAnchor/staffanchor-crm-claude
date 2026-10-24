import { sendEmail } from "@/lib/mail";
import { callRoute } from "./internal";
import type { Ctx, Payloads, ProposalKind, ProposalRow } from "./types";

// What happens when an admin approves a proposal. Messages go through the CRM's own routes (so their rules apply); records
// are created as the admin, under their own permissions. Every result says plainly what happened, including what was skipped.

export type Outcome = { ok: boolean; message: string; links?: { label: string; href: string }[] };
type Run = Pick<Ctx, "userId" | "supabase" | "admin" | "cookie" | "origin">;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const errOf = (j: Record<string, unknown>) => (typeof j.error === "string" ? j.error : "It did not go through.");

async function phoneOf(admin: Run["admin"], candidateId: string): Promise<string | null> {
  const { data } = await admin.from("candidates").select("phone").eq("id", candidateId).maybeSingle();
  return (data as { phone: string | null } | null)?.phone ?? null;
}

async function waReply(r: Run, p: Payloads["wa_reply"]): Promise<Outcome> {
  const phone = await phoneOf(r.admin, p.candidateId);
  if (!phone) return { ok: false, message: "No phone number on file for this candidate." };
  const res = await callRoute(r, "/api/whatsapp/reply-to-phone", { phone, body: p.body, candidateId: p.candidateId });
  return res.json.ok === true ? { ok: true, message: "Sent on WhatsApp.", links: [{ label: "Open the chat", href: `/candidates/${p.candidateId}` }] } : { ok: false, message: errOf(res.json) };
}

async function waTemplate(r: Run, p: Payloads["wa_template"]): Promise<Outcome> {
  if (p.template === "role_opportunity") {
    const res = await callRoute(r, "/api/whatsapp/role-opportunity", { mandateId: p.mandateId, candidateIds: p.candidateIds });
    const j = res.json as { ok?: boolean; sent?: number; failed?: number; noPhone?: number; optedOut?: number; alreadySent?: number; error?: string | null };
    if (!j.ok) return { ok: false, message: errOf(res.json) };
    const bits = [`Sent to ${j.sent ?? 0}`, j.failed ? `${j.failed} failed` : "", j.noPhone ? `${j.noPhone} had no usable number` : "", j.optedOut ? `${j.optedOut} opted out` : "", j.alreadySent ? `${j.alreadySent} already messaged recently` : ""].filter(Boolean);
    return { ok: (j.sent ?? 0) > 0, message: `${bits.join(", ")}.${j.error ? ` ${j.error}` : ""}` };
  }
  let sent = 0;
  const problems: string[] = [];
  for (const id of p.candidateIds) {
    let res: { status: number; json: Record<string, unknown> };
    if (p.template === "interview" || p.template === "offer") res = await callRoute(r, "/api/whatsapp/stage-template", { candidateId: id, mandateId: p.mandateId, kind: p.template });
    else if (p.template === "ask_missing") res = await callRoute(r, "/api/whatsapp/ask-missing", { candidateId: id });
    else {
      const phone = await phoneOf(r.admin, id);
      res = phone ? await callRoute(r, "/api/whatsapp/follow-up", { phone, candidateId: id }) : { status: 400, json: { error: "no number" } };
    }
    if (res.json.ok === true) sent++;
    else problems.push(errOf(res.json));
  }
  const left = problems.length ? ` ${problems.length} did not go: ${Array.from(new Set(problems)).slice(0, 3).join("; ")}` : "";
  return { ok: sent > 0, message: `Sent to ${sent} of ${p.candidateIds.length}.${left}` };
}

async function email(r: Run, p: Payloads["email"]): Promise<Outcome> {
  let to = "";
  let name = "";
  if (p.to === "candidate") {
    const { data } = await r.admin.from("candidates").select("full_name, email").eq("id", p.id).maybeSingle();
    to = (data as { email?: string } | null)?.email ?? "";
    name = (data as { full_name?: string } | null)?.full_name ?? "";
  } else {
    const { data } = await r.admin.from("client_contacts").select("full_name, email").eq("id", p.id).maybeSingle();
    to = (data as { email?: string } | null)?.email ?? "";
    name = (data as { full_name?: string } | null)?.full_name ?? "";
  }
  if (!to || /\.invalid$/i.test(to)) return { ok: false, message: "There is no email address on file." };
  const text = `${p.body.trim()}\n\nRegards,\nStaffAnchor Team`;
  try {
    await sendEmail({ to, subject: p.subject, text, html: text.split(/\n{2,}/).map((x) => `<p>${esc(x).replace(/\n/g, "<br/>")}</p>`).join(""), plain: true });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The email could not be sent." };
  }
  await r.admin.from("audit_log").insert({ actor: r.userId, action: "agent_email_sent", entity: p.to === "candidate" ? "candidate" : "client_contact", entity_id: p.id, detail: { subject: p.subject } });
  return { ok: true, message: `Emailed ${name || "them"}.` };
}

async function createClient(r: Run, p: Payloads["create_client"]): Promise<Outcome> {
  const { data, error } = await r.supabase.from("clients").insert({ name: p.name, industry: p.industry ?? null, hq_city: p.hq_city ?? null, website: p.website ?? null, owner_id: r.userId, created_via: "manual" }).select("id").single();
  if (error || !data) return { ok: false, message: error?.message ?? "Couldn't create the client." };
  await r.admin.from("audit_log").insert({ actor: r.userId, action: "agent_client_created", entity: "client", entity_id: data.id, detail: { name: p.name } });
  return { ok: true, message: `Created the client ${p.name}.`, links: [{ label: "Open the client", href: `/clients/${data.id}` }] };
}

async function createMandate(r: Run, p: Payloads["create_mandate"]): Promise<Outcome> {
  const { data, error } = await r.supabase
    .from("mandates")
    .insert({
      client_id: p.client_id ?? null, client_name: p.client_name, role_title: p.role_title, role_cluster: p.role_cluster, seniority_band: p.seniority_band,
      cities: p.cities, city: p.cities[0] ?? null, experience_min: p.experience_min ?? null, experience_max: p.experience_max ?? null,
      budget_min: p.budget_min ?? null, budget_max: p.budget_max ?? null, headcount: p.headcount ?? 1, jd_overview: p.jd_overview ?? null,
      show_client_name: true, status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "Couldn't create the mandate." };
  await r.supabase.rpc("assign_mandate_staff", { p_mandate_id: data.id, p_freelancer_id: r.userId });
  await callRoute(r, "/api/mandate-match", { mandateId: data.id });
  await r.admin.from("audit_log").insert({ actor: r.userId, action: "agent_mandate_created", entity: "mandate", entity_id: data.id, detail: { role: p.role_title } });
  return { ok: true, message: `Created ${p.role_title} as a draft, assigned to you. Add the must-haves before it goes live.`, links: [{ label: "Open the mandate", href: `/mandates/${data.id}` }] };
}

async function addToMandate(r: Run, p: Payloads["add_to_mandate"]): Promise<Outcome> {
  const { data: have } = await r.supabase.from("candidate_mandate_links").select("candidate_id").eq("mandate_id", p.mandateId).in("candidate_id", p.candidateIds);
  const skip = new Set(((have ?? []) as { candidate_id: string }[]).map((x) => x.candidate_id));
  const rows = p.candidateIds.filter((id) => !skip.has(id)).map((id) => ({ candidate_id: id, mandate_id: p.mandateId, added_by: r.userId, match_source: "shortlist", matched_at: new Date().toISOString() }));
  if (!rows.length) return { ok: true, message: "They were all in the mandate already." };
  const { error } = await r.supabase.from("candidate_mandate_links").insert(rows);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Added ${rows.length} to the mandate.`, links: [{ label: "Open the mandate", href: `/mandates/${p.mandateId}` }] };
}

async function note(r: Run, p: Payloads["note"]): Promise<Outcome> {
  const { error } = await r.supabase.from("recruiter_notes").insert({ candidate_id: p.candidateId, author_id: r.userId, note_type: p.noteType, content: p.text });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Note saved.", links: [{ label: "Open the candidate", href: `/candidates/${p.candidateId}` }] };
}

export async function execute(r: Run, p: Pick<ProposalRow, "kind" | "payload">): Promise<Outcome> {
  const kind: ProposalKind = p.kind;
  try {
    switch (kind) {
      case "wa_reply": return await waReply(r, p.payload as Payloads["wa_reply"]);
      case "wa_template": return await waTemplate(r, p.payload as Payloads["wa_template"]);
      case "email": return await email(r, p.payload as Payloads["email"]);
      case "create_client": return await createClient(r, p.payload as Payloads["create_client"]);
      case "create_mandate": return await createMandate(r, p.payload as Payloads["create_mandate"]);
      case "add_to_mandate": return await addToMandate(r, p.payload as Payloads["add_to_mandate"]);
      case "note": return await note(r, p.payload as Payloads["note"]);
      default: return { ok: false, message: "Unknown kind of proposal." };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
}
