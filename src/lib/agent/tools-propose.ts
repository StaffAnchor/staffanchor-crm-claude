import { callRoute, createProposal } from "./internal";
import { reachFor, type Reach } from "./messaging";
import { A, E, N, S, obj, str, uuid, uuids, type Tool } from "./tools-read";
import { NOTE_TYPES, SENIORITY_BANDS, type Ctx, type WaTemplateKind } from "./types";

// What the assistant can propose. None of these do anything: each saves a card for the admin to approve, edit or reject.
// Messages go out only when approved, through the CRM's own sending routes and the rules in them.

const MAX_RECIPIENTS = 20;
const TEMPLATES: WaTemplateKind[] = ["role_opportunity", "interview", "offer", "followup", "ask_missing"];
const TEMPLATE_LABEL: Record<WaTemplateKind, string> = {
  role_opportunity: "tell about a role",
  interview: "ask to coordinate an interview",
  offer: "follow up on an offer",
  followup: "check in after silence",
  ask_missing: "ask for missing profile details",
};

function eligible(kind: WaTemplateKind, r: Reach): boolean {
  if (!r.hasPhone || r.phoneHold || r.optedOut) return false;
  if (kind === "followup") return r.canTemplate && !r.windowOpen; // while their chat is open, reply directly instead
  return r.canTemplate;
}

export const proposeTools: Tool[] = [
  {
    status: "Drafting a WhatsApp reply",
    decl: {
      name: "propose_whatsapp_reply",
      description: "Propose a free-text WhatsApp reply to one candidate. Only works while their 24-hour chat window is open (check_reach says can_whatsapp_free_text). Nothing is sent: the admin approves it first.",
      parameters: obj({ candidate_id: S("The candidate id."), message: S("The message, in a warm, short, plain voice from StaffAnchor. No client names. No promises about pay or outcomes."), reason: S("Why this message, in one sentence, shown to the admin.") }, ["candidate_id", "message", "reason"]),
    },
    async run(a, ctx) {
      const id = uuid(a.candidate_id);
      const body = str(a.message, 1000);
      if (!id || body.length < 3) return { error: "A candidate and a message are needed." };
      const r = (await reachFor(ctx.admin, [id])).get(id);
      if (!r) return { error: "Candidate not found." };
      if (!r.canFreeText) return { error: `A free-text reply is not possible: ${r.why || (r.windowOpen ? "not allowed" : "their 24-hour chat window is closed. Use propose_whatsapp_template instead")}.` };
      return createProposal(ctx, { kind: "wa_reply", title: `Reply to ${r.name} on WhatsApp`, summary: str(a.reason, 300), payload: { candidateId: id, body }, preview: { recipients: [{ id, name: r.name }], messages: [body] } });
    },
  },
  {
    status: "Preparing WhatsApp messages",
    decl: {
      name: "propose_whatsapp_template",
      description: "Propose sending one of the approved WhatsApp templates to up to 20 candidates: role_opportunity (tell about a role, needs mandate_id), interview (needs mandate_id), offer (needs mandate_id), followup (they went quiet and their chat window is closed), ask_missing (ask for missing profile details). People who cannot be messaged are skipped and reported. Nothing is sent: the admin approves first.",
      parameters: obj({ template: E(TEMPLATES, "Which template."), candidate_ids: A(S("A candidate id."), "Who to message, at most 20."), mandate_id: S("The mandate, for role_opportunity, interview and offer."), reason: S("Why, in one sentence, shown to the admin.") }, ["template", "candidate_ids", "reason"]),
    },
    async run(a, ctx) {
      const kind = TEMPLATES.find((t) => t === a.template);
      if (!kind) return { error: "Unknown template." };
      const ids = uuids(a.candidate_ids, MAX_RECIPIENTS);
      const mandateId = uuid(a.mandate_id);
      if (!ids.length) return { error: "Choose at least one candidate." };
      if (["role_opportunity", "interview", "offer"].includes(kind) && !mandateId) return { error: "This template needs a mandate_id." };
      const reach = await reachFor(ctx.admin, ids);
      const ok = ids.map((i) => reach.get(i)).filter((r): r is Reach => !!r && eligible(kind, r));
      const skipped = ids.map((i) => reach.get(i)).filter((r): r is Reach => !!r && !eligible(kind, r)).map((r) => ({ name: r.name, why: r.why || (kind === "followup" && r.windowOpen ? "their chat is open, so reply to them directly" : "cannot be messaged now") }));
      if (!ok.length) return { error: "No one on that list can be messaged this way right now.", skipped };

      let mandateTitle = "";
      if (mandateId) {
        const { data: m } = await ctx.supabase.from("mandates").select("role_title").eq("id", mandateId).maybeSingle();
        if (!m) return { error: "Mandate not found." };
        mandateTitle = (m as { role_title: string }).role_title;
      }

      // The exact wording Meta will send, using the same route that sends it, in its preview mode.
      let messages: string[] = [];
      let note = "";
      if (kind === "role_opportunity") {
        const r = await callRoute(ctx, "/api/whatsapp/role-opportunity", { mandateId, candidateIds: ok.map((x) => x.id), preview: true });
        const pv = r.json.preview as { messages?: string[]; note?: string } | undefined;
        messages = pv?.messages ?? [];
        note = pv?.note ?? "";
      } else if (kind === "interview" || kind === "offer") {
        const r = await callRoute(ctx, "/api/whatsapp/stage-template", { candidateId: ok[0].id, mandateId, kind, preview: true });
        const pv = r.json.preview as { messages?: string[]; note?: string } | undefined;
        messages = pv?.messages ?? [];
        note = pv?.note ?? (typeof r.json.error === "string" ? r.json.error : "");
      } else if (kind === "ask_missing") {
        const r = await callRoute(ctx, "/api/whatsapp/ask-missing", { candidateId: ok[0].id, preview: true });
        const pv = r.json.preview as { messages?: string[]; note?: string } | undefined;
        messages = pv?.messages ?? [];
        note = pv?.note ?? "";
      } else {
        note = "Sent from StaffAnchor's number with the approved follow-up template. When they reply, the chat opens for 24 hours.";
      }
      const title = `WhatsApp ${ok.length} ${ok.length === 1 ? "candidate" : "candidates"}: ${TEMPLATE_LABEL[kind]}${mandateTitle ? ` (${mandateTitle})` : ""}`;
      return createProposal(ctx, { kind: "wa_template", title, summary: str(a.reason, 300), payload: { template: kind, candidateIds: ok.map((x) => x.id), mandateId: mandateId || undefined }, preview: { recipients: ok.map((x) => ({ id: x.id, name: x.name })), skipped, messages, note } });
    },
  },
  {
    status: "Drafting an email",
    decl: {
      name: "propose_email",
      description: "Propose an email to one candidate or one client contact. The CRM adds the StaffAnchor letterhead and signature. Nothing is sent: the admin approves first.",
      parameters: obj({ to_type: E(["candidate", "client_contact"], "Who it is for."), id: S("The candidate id, or the client contact id."), subject: S("Subject line."), body: S("The email body in plain text, a few short paragraphs, signed off simply (no name needed)."), reason: S("Why, in one sentence, shown to the admin.") }, ["to_type", "id", "subject", "body", "reason"]),
    },
    async run(a, ctx) {
      const to = a.to_type === "client_contact" ? "client_contact" : "candidate";
      const id = uuid(a.id);
      const subject = str(a.subject, 160);
      const body = str(a.body, 4000);
      if (!id || !subject || body.length < 10) return { error: "A recipient, subject and body are needed." };
      let name = "";
      if (to === "candidate") {
        const { data } = await ctx.admin.from("candidates").select("full_name, email").eq("id", id).maybeSingle();
        const c = data as { full_name: string | null; email: string | null } | null;
        if (!c) return { error: "Candidate not found." };
        if (!c.email || c.email.endsWith(".invalid")) return { error: "This candidate has no email on file." };
        name = c.full_name ?? "the candidate";
      } else {
        const { data } = await ctx.admin.from("client_contacts").select("full_name, email, client_id").eq("id", id).maybeSingle();
        const c = data as { full_name: string; email: string | null } | null;
        if (!c) return { error: "Client contact not found." };
        if (!c.email) return { error: "This contact has no email on file." };
        name = c.full_name;
      }
      return createProposal(ctx, { kind: "email", title: `Email ${name}: ${subject}`, summary: str(a.reason, 300), payload: { to, id, subject, body }, preview: { recipients: [{ id, name }], messages: [body], subject } });
    },
  },
  {
    status: "Preparing a new client",
    decl: { name: "propose_create_client", description: "Propose creating a client record. The admin approves first.", parameters: obj({ name: S("Company name."), industry: S("Industry, if known."), hq_city: S("Head office city, if known."), website: S("Website, if known."), reason: S("Where this came from, in one sentence.") }, ["name", "reason"]) },
    async run(a, ctx) {
      const name = str(a.name, 160);
      if (name.length < 2) return { error: "A company name is needed." };
      const { data: dup } = await ctx.supabase.from("clients").select("id, name").ilike("name", name.replace(/[%_]/g, "")).limit(3);
      if (dup && dup.length) return { error: "A client with that name already exists.", existing: dup };
      return createProposal(ctx, { kind: "create_client", title: `Create client: ${name}`, summary: str(a.reason, 300), payload: { name, industry: str(a.industry, 120) || undefined, hq_city: str(a.hq_city, 80) || undefined, website: str(a.website, 200) || undefined }, preview: { fields: { Name: name, Industry: str(a.industry, 120), "Head office": str(a.hq_city, 80), Website: str(a.website, 200) } } });
    },
  },
  {
    status: "Preparing a draft mandate",
    decl: {
      name: "propose_create_mandate",
      description: "Propose creating a mandate as a DRAFT. role_cluster and seniority_band are required and must be exactly what the admin told you or what the job description plainly states; never guess them: if unclear, ask the admin first (use role_options for valid values). The admin approves first.",
      parameters: obj({
        client_id: S("The client id, if the client exists."), client_name: S("The client name."), role_title: S("The role title."), role_cluster: S("A role type slug from role_options."), seniority_band: E(SENIORITY_BANDS, "The role level."),
        cities: A(S("A city."), "Cities for the role."), experience_min: N("Minimum years."), experience_max: N("Maximum years."), budget_min: N("Minimum fixed pay in lakhs per year."), budget_max: N("Maximum fixed pay in lakhs per year."), headcount: N("Number of openings."), jd_overview: S("Short overview of the role, from what the admin gave you only."), reason: S("Where this came from, in one sentence."),
      }, ["client_name", "role_title", "role_cluster", "seniority_band", "cities", "reason"]),
    },
    async run(a, ctx) {
      const { data: clusters } = await ctx.supabase.from("role_clusters").select("slug");
      const slugs = ((clusters ?? []) as { slug: string }[]).map((c) => c.slug);
      const cluster = str(a.role_cluster, 40);
      const band = str(a.seniority_band, 20);
      if (!slugs.includes(cluster)) return { error: `role_cluster must be one of: ${slugs.join(", ")}. Ask the admin if it is unclear.` };
      if (!SENIORITY_BANDS.includes(band)) return { error: `seniority_band must be one of: ${SENIORITY_BANDS.join(", ")}. Ask the admin if it is unclear.` };
      const title = str(a.role_title, 160);
      const clientName = str(a.client_name, 160);
      if (!title || !clientName) return { error: "A client and role title are needed." };
      const cities = (Array.isArray(a.cities) ? a.cities : []).map((c) => str(c, 60)).filter(Boolean).slice(0, 8);
      let clientId = uuid(a.client_id) || undefined;
      if (clientId) {
        const { data: c } = await ctx.supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
        if (!c) clientId = undefined;
      }
      const payload = {
        client_id: clientId, client_name: clientName, role_title: title, role_cluster: cluster, seniority_band: band, cities,
        experience_min: typeof a.experience_min === "number" ? a.experience_min : undefined, experience_max: typeof a.experience_max === "number" ? a.experience_max : undefined,
        budget_min: typeof a.budget_min === "number" ? a.budget_min : undefined, budget_max: typeof a.budget_max === "number" ? a.budget_max : undefined,
        headcount: typeof a.headcount === "number" && a.headcount >= 1 ? Math.floor(a.headcount) : 1, jd_overview: str(a.jd_overview, 3000) || undefined,
      };
      return createProposal(ctx, { kind: "create_mandate", title: `Create draft mandate: ${title} at ${clientName}`, summary: str(a.reason, 300), payload, preview: { fields: { Client: clientName, Role: title, "Role type": cluster, Level: band, Cities: cities.join(", "), Experience: [payload.experience_min, payload.experience_max].filter((x) => x !== undefined).join(" to "), "Fixed pay (LPA)": [payload.budget_min, payload.budget_max].filter((x) => x !== undefined).join(" to "), Openings: String(payload.headcount) } } });
    },
  },
  {
    status: "Preparing to add candidates",
    decl: { name: "propose_add_to_mandate", description: "Propose adding candidates to a mandate's pipeline at the first stage (sourced). The admin approves first.", parameters: obj({ mandate_id: S("The mandate id."), candidate_ids: A(S("A candidate id."), "Who to add, at most 20."), reason: S("Why, in one sentence.") }, ["mandate_id", "candidate_ids", "reason"]) },
    async run(a, ctx) {
      const mandateId = uuid(a.mandate_id);
      const ids = uuids(a.candidate_ids, MAX_RECIPIENTS);
      if (!mandateId || !ids.length) return { error: "A mandate and at least one candidate are needed." };
      const { data: m } = await ctx.supabase.from("mandates").select("role_title, client_name").eq("id", mandateId).maybeSingle();
      if (!m) return { error: "Mandate not found." };
      const [{ data: people }, { data: already }] = await Promise.all([
        ctx.supabase.from("candidates").select("id, full_name").in("id", ids),
        ctx.supabase.from("candidate_mandate_links").select("candidate_id").eq("mandate_id", mandateId).in("candidate_id", ids),
      ]);
      const have = new Set(((already ?? []) as { candidate_id: string }[]).map((x) => x.candidate_id));
      const add = ((people ?? []) as { id: string; full_name: string }[]).filter((p) => !have.has(p.id));
      if (!add.length) return { error: "They are all in this mandate already." };
      const mm = m as { role_title: string; client_name: string };
      return createProposal(ctx, { kind: "add_to_mandate", title: `Add ${add.length} ${add.length === 1 ? "candidate" : "candidates"} to ${mm.role_title}`, summary: str(a.reason, 300), payload: { mandateId, candidateIds: add.map((p) => p.id) }, preview: { recipients: add.map((p) => ({ id: p.id, name: p.full_name })), skipped: have.size ? [{ name: `${have.size} already in the mandate`, why: "left out" }] : [], note: `${mm.role_title} at ${mm.client_name}` } });
    },
  },
  {
    status: "Drafting a note",
    decl: { name: "propose_note", description: "Propose saving a note on a candidate's record. The admin approves first.", parameters: obj({ candidate_id: S("The candidate id."), text: S("The note, in plain words, from what the admin told you only."), note_type: E(NOTE_TYPES, "The kind of note.") }, ["candidate_id", "text"]) },
    async run(a, ctx) {
      const id = uuid(a.candidate_id);
      const text = str(a.text, 3000);
      if (!id || text.length < 3) return { error: "A candidate and a note are needed." };
      const { data: c } = await ctx.supabase.from("candidates").select("full_name").eq("id", id).maybeSingle();
      if (!c) return { error: "Candidate not found." };
      const noteType = NOTE_TYPES.includes(str(a.note_type, 30)) ? str(a.note_type, 30) : "call_note";
      return createProposal(ctx, { kind: "note", title: `Save a note on ${(c as { full_name: string }).full_name}`, summary: "", payload: { candidateId: id, text, noteType }, preview: { recipients: [{ id, name: (c as { full_name: string }).full_name }], messages: [text] } });
    },
  },
];

export type { Ctx };
