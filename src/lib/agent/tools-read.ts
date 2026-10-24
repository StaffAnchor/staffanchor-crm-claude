import { SchemaType, type FunctionDeclaration, type Schema } from "@google/generative-ai";
import { searchCandidates, seedFromMandate } from "@/lib/prompt-search";
import { WINDOW_MS, phoneKey } from "@/lib/whatsapp-threads";
import { reachFor } from "./messaging";
import { redact } from "./redact";
import { SENIORITY_BANDS, type Ctx } from "./types";

// What the assistant can look up. Every result is shaped here: names, roles, stages and figures go to the AI; phone numbers,
// emails and links never do. Reads run as the signed-in admin.

export type Tool = { decl: FunctionDeclaration; status: string; run: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown> };

export const S = (description: string): Schema => ({ type: SchemaType.STRING, description });
export const N = (description: string): Schema => ({ type: SchemaType.NUMBER, description });
export const A = (items: Schema, description: string): Schema => ({ type: SchemaType.ARRAY, items, description });
export const E = (values: string[], description: string): Schema => ({ type: SchemaType.STRING, format: "enum", enum: values, description });
// Gemini refuses an object with no properties and is picky about an empty "required" list, so neither is ever sent.
export const obj = (properties: Record<string, Schema>, required: string[] = []) => ({ type: SchemaType.OBJECT as const, properties, ...(required.length ? { required } : {}) });

export const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const uuid = (v: unknown): string => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : "");
export const uuids = (v: unknown, max = 50): string[] => (Array.isArray(v) ? v.map(uuid).filter(Boolean).slice(0, max) : []);

const days = (iso: string | null | undefined, now: number) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : null);

const CAND_COLS = "id, full_name, status, current_job_title, current_employer, category, sub_domain, total_experience_years, current_location, notice_period, current_fixed_ctc, expected_fixed_ctc, skills, current_industry, ai_summary, created_at";

export const readTools: Tool[] = [
  {
    status: "Searching candidates",
    decl: {
      name: "search_candidates",
      description: "Find candidates in the whole database from a plain-language ask (role, city, experience, pay, notice, selling style). Returns ranked matches with the reason for each. Pass mandate_id to search for a mandate; then the query may be empty.",
      parameters: obj({ query: S("What to look for, in plain words, for example 'B2B SaaS account executives in Bangalore with 4 to 7 years, hunters'."), mandate_id: S("A mandate id, to search for that role.") }),
    },
    async run(a, ctx) {
      let prompt = str(a.query, 600);
      const mandateId = uuid(a.mandate_id) || undefined;
      let spec: Parameters<typeof searchCandidates>[2] extends infer O ? (O extends { spec?: infer S2 } ? S2 : never) : never = undefined as never;
      let embeddingText: string | undefined;
      if (mandateId) {
        const { data: m } = await ctx.supabase.from("mandates").select("role_title, sub_domain, city, cities, experience_min, experience_max, budget_max, must_haves, good_to_haves, selling_style, jd_overview").eq("id", mandateId).maybeSingle();
        if (!m) return { error: "Mandate not found." };
        const seed = seedFromMandate(m as Parameters<typeof seedFromMandate>[0]);
        if (!prompt) prompt = seed.prompt;
        spec = seed.spec as never;
        embeddingText = seed.embeddingText;
      }
      if (!prompt) return { error: "Say what to look for." };
      const r = await searchCandidates(prompt, ctx.supabase, { mandateId, spec, embeddingText });
      if (!r.ok) return { error: r.error };
      return {
        searched: r.scanned,
        already_in_this_mandate_pipeline_skipped: r.inPipelineSkipped,
        hidden_by_hard_constraints: r.hidden,
        matches: r.matches.slice(0, 12).map((m) => ({
          candidate_id: m.candidate_id, name: m.full_name, title: m.current_job_title, employer: m.current_employer, city: m.current_location,
          experience_years: m.total_experience_years, current_ctc_lpa: m.current_fixed_ctc, expected_ctc_lpa: m.expected_fixed_ctc, notice: m.notice_period,
          score: m.score, why: redact(m.reason, 300), unknown_details: m.missing,
        })),
      };
    },
  },
  {
    status: "Looking up the candidate",
    decl: { name: "get_candidate", description: "Everything useful about one candidate: profile, which mandates and stages they are in, recent notes, and whether and how they can be messaged. No contact details are included.", parameters: obj({ candidate_id: S("The candidate id.") }, ["candidate_id"]) },
    async run(a, ctx) {
      const id = uuid(a.candidate_id);
      if (!id) return { error: "A candidate id is needed." };
      const { data: c } = await ctx.supabase.from("candidates").select(CAND_COLS).eq("id", id).maybeSingle();
      if (!c) return { error: "Candidate not found." };
      const [{ data: links }, { data: notes }, reach] = await Promise.all([
        ctx.supabase.from("candidate_mandate_links").select("mandate_id, stage, stage_updated_at, in_shortlist, match_score, mandates(role_title, client_name)").eq("candidate_id", id),
        ctx.supabase.from("recruiter_notes").select("note_type, content, created_at").eq("candidate_id", id).order("created_at", { ascending: false }).limit(3),
        reachFor(ctx.admin, [id]),
      ]);
      const now = new Date().getTime();
      const r = reach.get(id);
      return {
        profile: { ...c, ai_summary: redact((c as { ai_summary?: string }).ai_summary, 500) },
        mandates: ((links ?? []) as unknown as { mandate_id: string; stage: string; stage_updated_at: string; in_shortlist: boolean; match_score: number | null; mandates: { role_title: string; client_name: string } | null }[]).map((l) => ({
          mandate_id: l.mandate_id, role: l.mandates?.role_title, client: l.mandates?.client_name, stage: l.stage, days_in_stage: days(l.stage_updated_at, now), shortlisted: l.in_shortlist, match_score: l.match_score,
        })),
        recent_notes: ((notes ?? []) as { note_type: string; content: string; created_at: string }[]).map((n) => ({ type: n.note_type, text: redact(n.content, 300), days_ago: days(n.created_at, now) })),
        messaging: r ? { can_whatsapp_free_text: r.canFreeText, can_whatsapp_template: r.canTemplate, chat_window_open: r.windowOpen, last_message_from_them_days_ago: days(r.lastInboundAt, now), last_message_to_them_days_ago: days(r.lastOutboundAt, now), has_email: r.hasEmail, blocked_because: r.why || null } : null,
      };
    },
  },
  {
    status: "Checking the mandates",
    decl: { name: "list_mandates", description: "List mandates with how many candidates are at each stage. Filter by status (open, draft, on_hold, closed, filled) or client name.", parameters: obj({ status: E(["open", "draft", "on_hold", "closed", "filled"], "Only mandates with this status."), client: S("Part of the client name."), limit: N("How many, at most 30.") }) },
    async run(a, ctx) {
      let q = ctx.supabase.from("mandates").select("id, role_title, client_name, status, city, cities, headcount, seniority_band, role_cluster, created_at, target_fill_date").eq("is_archived", false).order("created_at", { ascending: false }).limit(Math.min(30, num(a.limit) ?? 20));
      const status = str(a.status, 20);
      if (status) q = q.eq("status", status);
      const client = str(a.client, 80);
      if (client) q = q.ilike("client_name", `%${client.replace(/[%_]/g, "")}%`);
      const { data: ms } = await q;
      const list = (ms ?? []) as { id: string; role_title: string; client_name: string; status: string; city: string | null; cities: string[] | null; headcount: number | null; seniority_band: string | null; role_cluster: string | null; created_at: string; target_fill_date: string | null }[];
      const { data: links } = list.length ? await ctx.supabase.from("candidate_mandate_links").select("mandate_id, stage").in("mandate_id", list.map((m) => m.id)) : { data: [] };
      const by: Record<string, Record<string, number>> = {};
      for (const l of (links ?? []) as { mandate_id: string; stage: string }[]) {
        by[l.mandate_id] ??= {};
        by[l.mandate_id][l.stage] = (by[l.mandate_id][l.stage] ?? 0) + 1;
      }
      const now = new Date().getTime();
      return { mandates: list.map((m) => ({ mandate_id: m.id, role: m.role_title, client: m.client_name, status: m.status, cities: m.cities?.length ? m.cities : m.city ? [m.city] : [], headcount: m.headcount, level: m.seniority_band, role_type: m.role_cluster, age_days: days(m.created_at, now), target_fill_date: m.target_fill_date, candidates_by_stage: by[m.id] ?? {} })) };
    },
  },
  {
    status: "Reading the mandate",
    decl: { name: "get_mandate", description: "One mandate in full: the role, requirements, and every candidate in its pipeline with their stage and how long they have been there.", parameters: obj({ mandate_id: S("The mandate id.") }, ["mandate_id"]) },
    async run(a, ctx) {
      const id = uuid(a.mandate_id);
      if (!id) return { error: "A mandate id is needed." };
      const { data: m } = await ctx.supabase.from("mandates").select("id, role_title, client_name, client_id, status, city, cities, headcount, experience_min, experience_max, budget_min, budget_max, seniority_band, role_cluster, must_haves, good_to_haves, jd_overview, work_mode, selling_style, notes, created_at, target_fill_date").eq("id", id).maybeSingle();
      if (!m) return { error: "Mandate not found." };
      const { data: links } = await ctx.supabase.from("candidate_mandate_links").select("candidate_id, stage, stage_updated_at, in_shortlist, match_score, candidates(full_name, current_job_title, current_employer, current_location)").eq("mandate_id", id).order("stage_updated_at", { ascending: false }).limit(80);
      const now = new Date().getTime();
      const rows = (links ?? []) as unknown as { candidate_id: string; stage: string; stage_updated_at: string; in_shortlist: boolean; match_score: number | null; candidates: { full_name: string; current_job_title: string | null; current_employer: string | null; current_location: string | null } | null }[];
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
      const mm = m as Record<string, unknown>;
      return {
        mandate: { ...mm, jd_overview: redact(mm.jd_overview as string, 800), notes: redact(mm.notes as string, 400) },
        stage_counts: counts,
        pipeline: rows.map((r) => ({ candidate_id: r.candidate_id, name: r.candidates?.full_name, title: r.candidates?.current_job_title, employer: r.candidates?.current_employer, city: r.candidates?.current_location, stage: r.stage, days_in_stage: days(r.stage_updated_at, now), shortlisted: r.in_shortlist, match_score: r.match_score })),
      };
    },
  },
  {
    status: "Looking at clients",
    decl: { name: "list_clients", description: "List clients, with how many open mandates each has. Optionally search by name.", parameters: obj({ search: S("Part of the client name.") }) },
    async run(a, ctx) {
      let q = ctx.supabase.from("clients").select("id, name, industry, hq_city, created_at").order("created_at", { ascending: false }).limit(40);
      const s = str(a.search, 80);
      if (s) q = q.ilike("name", `%${s.replace(/[%_]/g, "")}%`);
      const { data: cs } = await q;
      const list = (cs ?? []) as { id: string; name: string; industry: string | null; hq_city: string | null; created_at: string }[];
      const { data: ms } = list.length ? await ctx.supabase.from("mandates").select("client_id, status").in("client_id", list.map((c) => c.id)) : { data: [] };
      const open: Record<string, number> = {};
      const all: Record<string, number> = {};
      for (const m of (ms ?? []) as { client_id: string; status: string }[]) {
        all[m.client_id] = (all[m.client_id] ?? 0) + 1;
        if (m.status === "open") open[m.client_id] = (open[m.client_id] ?? 0) + 1;
      }
      return { clients: list.map((c) => ({ client_id: c.id, name: c.name, industry: c.industry, city: c.hq_city, open_mandates: open[c.id] ?? 0, total_mandates: all[c.id] ?? 0 })) };
    },
  },
  {
    status: "Reading the client",
    decl: { name: "get_client", description: "One client: details, its contacts (names and designations only), and its mandates.", parameters: obj({ client_id: S("The client id.") }, ["client_id"]) },
    async run(a, ctx) {
      const id = uuid(a.client_id);
      if (!id) return { error: "A client id is needed." };
      const { data: c } = await ctx.supabase.from("clients").select("id, name, industry, hq_city, website, notes, fee_percentage, created_at").eq("id", id).maybeSingle();
      if (!c) return { error: "Client not found." };
      const [{ data: contacts }, { data: ms }] = await Promise.all([
        ctx.supabase.from("client_contacts").select("id, full_name, designation, is_primary, email").eq("client_id", id),
        ctx.supabase.from("mandates").select("id, role_title, status, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(30),
      ]);
      const cc = c as Record<string, unknown>;
      return {
        client: { ...cc, website: undefined, notes: redact(cc.notes as string, 500) },
        contacts: ((contacts ?? []) as { id: string; full_name: string; designation: string | null; is_primary: boolean; email: string | null }[]).map((p) => ({ contact_id: p.id, name: p.full_name, designation: p.designation, primary: p.is_primary, has_email: !!p.email })),
        mandates: ((ms ?? []) as { id: string; role_title: string; status: string; created_at: string }[]).map((m) => ({ mandate_id: m.id, role: m.role_title, status: m.status })),
      };
    },
  },
  {
    status: "Finding what needs attention",
    decl: { name: "pipeline_attention", description: "What needs attention across open mandates: stale ones, empty pipelines, no shortlist, and candidates stuck in a stage. Use for 'what needs me today' questions.", parameters: obj({ stale_days: N("Days without movement that counts as stale. Default 7.") }) },
    async run(a, ctx) {
      const staleDays = Math.max(2, Math.min(60, num(a.stale_days) ?? 7));
      const now = new Date().getTime();
      const { data: ms } = await ctx.supabase.from("mandates").select("id, role_title, client_name, created_at").eq("status", "open").eq("is_archived", false);
      const open = (ms ?? []) as { id: string; role_title: string; client_name: string; created_at: string }[];
      if (!open.length) return { open_mandates: 0 };
      const { data: links } = await ctx.supabase.from("candidate_mandate_links").select("mandate_id, candidate_id, stage, stage_updated_at, in_shortlist, candidates(full_name)").in("mandate_id", open.map((m) => m.id));
      const rows = (links ?? []) as unknown as { mandate_id: string; candidate_id: string; stage: string; stage_updated_at: string; in_shortlist: boolean; candidates: { full_name: string } | null }[];
      const out: { mandate_id: string; role: string; client: string; issues: string[] }[] = [];
      const stuck: { candidate_id: string; name: string | undefined; mandate: string; stage: string; days: number | null }[] = [];
      for (const m of open) {
        const mine = rows.filter((r) => r.mandate_id === m.id && r.stage !== "rejected" && r.stage !== "pulled_back");
        const issues: string[] = [];
        if (!mine.length) issues.push("no candidates in the pipeline");
        else {
          const last = mine.reduce((x, r) => (r.stage_updated_at > x ? r.stage_updated_at : x), "");
          const idle = days(last, now);
          if (idle !== null && idle >= staleDays) issues.push(`nothing has moved for ${idle} days`);
          if (!mine.some((r) => r.in_shortlist || ["shortlisted", "submitted", "client_shortlisted", "client_interview", "placed"].includes(r.stage))) issues.push("no one shortlisted yet");
        }
        const age = days(m.created_at, now);
        if (age !== null && age >= 14 && !mine.some((r) => ["submitted", "client_shortlisted", "client_interview", "placed"].includes(r.stage))) issues.push(`open ${age} days with nothing submitted to the client`);
        if (issues.length) out.push({ mandate_id: m.id, role: m.role_title, client: m.client_name, issues });
        for (const r of mine) {
          const d = days(r.stage_updated_at, now);
          if (["submitted", "client_shortlisted", "client_interview"].includes(r.stage) && d !== null && d >= staleDays) stuck.push({ candidate_id: r.candidate_id, name: r.candidates?.full_name, mandate: m.role_title, stage: r.stage, days: d });
        }
      }
      return { open_mandates: open.length, mandates_needing_attention: out.slice(0, 20), waiting_on_client_or_candidate: stuck.sort((x, y) => (y.days ?? 0) - (x.days ?? 0)).slice(0, 15) };
    },
  },
  {
    status: "Checking WhatsApp",
    decl: { name: "whatsapp_overview", description: "The state of WhatsApp: chats waiting for a human, messages from people that nobody has answered, and recent sends and failures.", parameters: obj({ unanswered_hours: N("How long an unanswered message counts as waiting. Default 4.") }) },
    async run(a, ctx) {
      const hours = Math.max(1, Math.min(240, num(a.unanswered_hours) ?? 4));
      const now = new Date().getTime();
      const since = new Date(now - 7 * 86_400_000).toISOString();
      const { data: msgs } = await ctx.admin.from("whatsapp_messages").select("to_phone, direction, body_preview, template_name, status, created_at, candidate_id").gte("created_at", since).order("created_at", { ascending: false }).limit(1500);
      const rows = (msgs ?? []) as { to_phone: string; direction: string; body_preview: string | null; template_name: string | null; status: string | null; created_at: string; candidate_id: string | null }[];
      const byKey = new Map<string, typeof rows>();
      for (const m of rows) {
        const k = phoneKey(m.to_phone);
        if (k) byKey.set(k, [...(byKey.get(k) ?? []), m]);
      }
      const keys = Array.from(byKey.keys());
      const [{ data: contacts }] = await Promise.all([keys.length ? ctx.admin.from("whatsapp_contacts").select("phone_key, kind, display_name, needs_human, needs_human_reason, bot_paused, opted_out, archived_at, muted, candidate_id").in("phone_key", keys) : Promise.resolve({ data: [] })]);
      const cmap = new Map(((contacts ?? []) as { phone_key: string; kind: string | null; display_name: string | null; needs_human: boolean | null; needs_human_reason: string | null; opted_out: boolean | null; archived_at: string | null; muted: boolean | null; candidate_id: string | null }[]).map((c) => [c.phone_key, c]));
      const waiting: unknown[] = [];
      const needsHuman: unknown[] = [];
      for (const [k, list] of byKey) {
        const c = cmap.get(k);
        if (c?.archived_at || c?.muted) continue;
        const last = list[0];
        const who = { candidate_id: c?.candidate_id ?? last.candidate_id ?? null, name: c?.display_name ?? "Unknown", kind: c?.kind ?? "unsorted" };
        if (c?.needs_human) needsHuman.push({ ...who, reason: c.needs_human_reason, last_message: redact(last.body_preview, 200) });
        if (last.direction === "inbound") {
          const age = (now - new Date(last.created_at).getTime()) / 3_600_000;
          if (age >= hours) waiting.push({ ...who, hours_waiting: Math.round(age), chat_window_open: now - new Date(last.created_at).getTime() < WINDOW_MS, they_said: redact(last.body_preview, 240) });
        }
      }
      const sentWeek = rows.filter((m) => m.direction === "outbound" && m.status === "sent").length;
      const failedWeek = rows.filter((m) => m.direction === "outbound" && m.status === "failed").length;
      return { waiting_for_a_reply: waiting.slice(0, 20), needs_a_human: needsHuman.slice(0, 15), last_7_days: { messages_sent: sentWeek, failed: failedWeek, chats_active: byKey.size } };
    },
  },
  {
    status: "Reading the WhatsApp chat",
    decl: { name: "whatsapp_thread", description: "The recent WhatsApp messages with one candidate (newest last), without the phone number.", parameters: obj({ candidate_id: S("The candidate id.") }, ["candidate_id"]) },
    async run(a, ctx) {
      const id = uuid(a.candidate_id);
      if (!id) return { error: "A candidate id is needed." };
      const { data: c } = await ctx.admin.from("candidates").select("full_name, phone").eq("id", id).maybeSingle();
      const key = phoneKey((c as { phone?: string } | null)?.phone ?? null);
      if (!c || !key || key.length !== 10) return { error: "No usable number, so there is no chat to read." };
      const { data: msgs } = await ctx.admin.from("whatsapp_messages").select("direction, body_preview, template_name, status, created_at").in("to_phone", [key, `91${key}`, `+91${key}`]).order("created_at", { ascending: false }).limit(25);
      const now = new Date().getTime();
      return { name: (c as { full_name: string }).full_name, messages: ((msgs ?? []) as { direction: string; body_preview: string | null; template_name: string | null; status: string | null; created_at: string }[]).reverse().map((m) => ({ from: m.direction === "inbound" ? "them" : "us", text: redact(m.body_preview, 300), template: m.template_name, status: m.status, hours_ago: Math.round((now - new Date(m.created_at).getTime()) / 3_600_000) })) };
    },
  },
  {
    status: "Checking who can be messaged",
    decl: { name: "check_reach", description: "For up to 40 candidates: can they be messaged on WhatsApp (free text only while their 24-hour window is open, otherwise only by approved template), are they on hold or opted out, were they messaged recently, do they have an email. Always use this before proposing messages.", parameters: obj({ candidate_ids: A(S("A candidate id."), "The candidates to check.") }, ["candidate_ids"]) },
    async run(a, ctx) {
      const ids = uuids(a.candidate_ids, 40);
      const m = await reachFor(ctx.admin, ids);
      const now = new Date().getTime();
      return { people: ids.map((id) => { const r = m.get(id); return r ? { candidate_id: id, name: r.name, can_whatsapp_free_text: r.canFreeText, can_whatsapp_template: r.canTemplate, chat_window_open: r.windowOpen, last_message_from_them_days_ago: days(r.lastInboundAt, now), has_email: r.hasEmail, blocked_because: r.why || null } : { candidate_id: id, error: "not found" }; }) };
    },
  },
  {
    status: "Counting",
    decl: { name: "count_candidates", description: "How many candidates match simple filters. Use for 'how many' questions.", parameters: obj({ city: S("Part of the current city."), category: S("The candidate category."), status: S("Candidate status such as lead, registered, awaiting_input."), min_experience: N("Minimum years of experience."), max_experience: N("Maximum years of experience."), created_in_last_days: N("Only candidates added in the last N days."), has_cv: E(["yes", "no"], "Only with or without a CV file.") }) },
    async run(a, ctx) {
      let q = ctx.supabase.from("candidates").select("id", { count: "exact", head: true });
      const city = str(a.city, 60);
      if (city) q = q.ilike("current_location", `%${city.replace(/[%_]/g, "")}%`);
      const cat = str(a.category, 60);
      if (cat) q = q.ilike("category", `%${cat.replace(/[%_]/g, "")}%`);
      const st = str(a.status, 30);
      if (st) q = q.eq("status", st);
      const lo = num(a.min_experience);
      if (lo !== null) q = q.gte("total_experience_years", lo);
      const hi = num(a.max_experience);
      if (hi !== null) q = q.lte("total_experience_years", hi);
      const d = num(a.created_in_last_days);
      if (d !== null) q = q.gte("created_at", new Date(new Date().getTime() - d * 86_400_000).toISOString());
      if (a.has_cv === "yes") q = q.not("resume_file_url", "is", null);
      if (a.has_cv === "no") q = q.is("resume_file_url", null);
      const { count, error } = await q;
      return error ? { error: error.message } : { count: count ?? 0 };
    },
  },
  {
    status: "Checking the options",
    decl: { name: "role_options", description: "The valid role types and role levels for a new mandate. Use before proposing a mandate. Takes no input." },
    async run(_a, ctx) {
      const { data } = await ctx.supabase.from("role_clusters").select("slug, name, track, hint").order("sort_order");
      return { role_types: data ?? [], role_levels: SENIORITY_BANDS };
    },
  },
];
