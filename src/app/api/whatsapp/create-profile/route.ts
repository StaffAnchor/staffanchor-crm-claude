import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { extractResumeText } from "@/lib/resume-text";
import { extractFieldsWithGemini } from "@/lib/cv-profile-extract";
import { extractCvFactsForCandidate } from "@/lib/cv-facts";
import { downloadWhatsAppMedia, mediaOf, safeFileName } from "@/lib/whatsapp-media";
import { phoneKey } from "@/lib/whatsapp-threads";

export const runtime = "nodejs";
export const maxDuration = 120;

// "Create profile from this CV": a recruiter turns a CV someone sent on WhatsApp into a candidate
// profile. The number comes from the chat, everything else is read from the CV. If the CV shows no
// email (a profile needs one), the recruiter is asked for it and calls this again with it filled in.
// Nobody is emailed. If the person already has a profile, the CV is added to it instead.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { messageId, email: emailOverride } = (await req.json().catch(() => ({}))) as { messageId?: string; email?: string };
  if (!messageId) return NextResponse.json({ error: "Pick the message that has the CV." }, { status: 400 });

  const { data: msg } = await supabase.from("whatsapp_messages").select("id, to_phone, raw_payload, media_path, media_name, media_type").eq("id", messageId).maybeSingle();
  if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  const key = phoneKey(msg.to_phone as string | null);
  if (!key || key.length !== 10) return NextResponse.json({ error: "This chat's phone number can't be read." }, { status: 400 });

  // 1. Get the file: the copy we kept, or fetch it from WhatsApp now.
  const found = mediaOf(msg.raw_payload);
  let bytes: Uint8Array | null = null;
  let mime: string | null = (msg.media_type as string | null) ?? found?.mime ?? null;
  const fileName = (msg.media_name as string | null) ?? found?.name ?? "cv";
  if (msg.media_path) {
    const dl = await admin.storage.from("client-resources").download(msg.media_path as string);
    if (dl.data) bytes = new Uint8Array(await dl.data.arrayBuffer());
  }
  if (!bytes && found) {
    const media = await downloadWhatsAppMedia(found.id);
    if (media) {
      bytes = media.bytes;
      mime = media.mime ?? mime;
    }
  }
  if (!bytes || bytes.byteLength === 0) return NextResponse.json({ error: "Couldn't get the file from WhatsApp. It may have expired; ask them to send it again." }, { status: 410 });

  // 2. Read it.
  const base = safeFileName(fileName);
  const ext = /\.(pdf|docx?)$/i.test(base) ? "" : /pdf/i.test(mime ?? "") ? ".pdf" : /word/i.test(mime ?? "") ? ".docx" : "";
  const storedName = `${base}${ext}`;
  const text = await extractResumeText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, storedName);
  if (!text) return NextResponse.json({ error: "Couldn't read text from this file. Only PDF and Word CVs can be read." }, { status: 422 });
  const extracted = await extractFieldsWithGemini(text, !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.MISTRAL_API_KEY), { category: null, sells: null });

  // 3. Already in the database? Add the CV to that profile instead of making a second one.
  const { data: ident } = await admin.rpc("whatsapp_identity_lookup", { p_key: key });
  const known = (ident as { candidate?: { id: string } | null } | null)?.candidate ?? null;
  const email = (emailOverride ?? extracted?.email ?? "").trim().toLowerCase();
  let existingId: string | null = known?.id ?? null;
  if (!existingId && email) {
    const { data: byEmail } = await admin.from("candidates").select("id").ilike("email", email).limit(1).maybeSingle();
    existingId = (byEmail?.id as string | undefined) ?? null;
  }
  if (!existingId && !email.includes("@")) {
    return NextResponse.json(
      { ok: false, needsEmail: true, error: "The CV doesn't show an email address. Enter the candidate's email to create the profile.", name: extracted?.full_name ?? null },
      { status: 200 }
    );
  }

  // 4. Keep the CV with the profile.
  const path = `${crypto.randomUUID()}-${storedName}`;
  const { error: upErr } = await admin.storage.from("resumes").upload(path, bytes, { contentType: mime ?? undefined });
  if (upErr) return NextResponse.json({ error: `Couldn't store the CV: ${upErr.message}` }, { status: 500 });

  const x = extracted;
  const fields: Record<string, unknown> = {
    full_name: x?.full_name ?? null,
    current_location: x?.current_location ?? null,
    current_employer: x?.current_employer ?? null,
    current_job_title: x?.current_job_title ?? null,
    total_experience_years: x?.total_experience_years ?? null,
    category: x?.category ?? null,
    current_fixed_ctc: x?.current_fixed_ctc ?? null,
    notice_period: x?.notice_period ?? null,
    highest_qualification: x?.highest_qualification ?? null,
    linkedin_url: x?.linkedin_url ?? null,
    current_industry: x?.current_industry ?? null,
    skills: x?.skills?.length ? x.skills.join(", ") : null,
    industries: x?.industries?.length ? x.industries : null,
    resume_text: text,
  };

  let candidateId: string;
  let created = false;
  if (existingId) {
    // Fill blanks only, and attach the CV if there is none.
    const { data: cur } = await admin.from("candidates").select("*").eq("id", existingId).maybeSingle();
    const patch: Record<string, unknown> = {};
    for (const [col, v] of Object.entries(fields)) {
      const have = (cur as Record<string, unknown> | null)?.[col];
      const empty = have === null || have === undefined || have === "" || (Array.isArray(have) && have.length === 0);
      if (empty && v !== null && v !== undefined) patch[col] = v;
    }
    if (!(cur as { phone?: string | null } | null)?.phone) patch.phone = key;
    if (!(cur as { resume_file_url?: string | null } | null)?.resume_file_url) patch.resume_file_url = path;
    if (Object.keys(patch).length) await admin.from("candidates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existingId);
    candidateId = existingId;
  } else {
    const segment: Record<string, unknown> = {};
    if (x?.languages_known?.length) segment.languages_known = x.languages_known;
    if (x?.role_level) segment.role_level = x.role_level;
    if (x?.sells_now?.length) segment.sells_now = x.sells_now;
    if (x?.sells_before?.length) segment.sells_before = x.sells_before;
    if (x?.customer_segments?.length) segment.customer_segment_sold = x.customer_segments;
    if (x?.tools?.length) segment.crm_tools = x.tools;
    const { data: ins, error: insErr } = await admin
      .from("candidates")
      .insert({
        ...fields,
        full_name: x?.full_name ?? "WhatsApp candidate",
        email,
        phone: key,
        resume_file_url: path,
        segment_data: segment,
        status: "lead",
        profile_stage: "lead",
        created_by: "whatsapp",
        whatsapp_opt_in: true,
      })
      .select("id")
      .single();
    if (insErr || !ins) return NextResponse.json({ error: `Couldn't create the profile: ${insErr?.message ?? "unknown error"}` }, { status: 500 });
    candidateId = ins.id as string;
    created = true;
  }

  // 5. Tie the chat to the profile, and read the CV in more depth in the background.
  await admin.from("whatsapp_contacts").upsert({ phone_key: key, kind: "jobseeker", kind_source: "manual", candidate_id: candidateId, needs_human: false, needs_human_reason: null }, { onConflict: "phone_key" });
  await admin.from("whatsapp_messages").update({ candidate_id: candidateId }).ilike("to_phone", `%${key}`).is("candidate_id", null);
  waitUntil(extractCvFactsForCandidate(candidateId, admin).catch(() => undefined));

  return NextResponse.json({ ok: true, candidateId, created, name: x?.full_name ?? null });
}
