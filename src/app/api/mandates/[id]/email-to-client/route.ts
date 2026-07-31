import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { STAGES, applyStageChange } from "@/lib/mandate-stage";

// Emails a hand-picked set of candidates on this mandate straight to one or
// more client contacts -- resumes attached, a link to the (already-existing,
// no-login) client shortlist for this mandate, and on send, each candidate
// is automatically marked in_shortlist + stage "submitted" (same real-world
// event as clicking "Move to client shortlist" in the table, just triggered
// by the email going out instead of a separate manual step). This is the
// single action a recruiter takes to both notify the client AND update the
// pipeline -- no second step to remember.
const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: mandateId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { candidateIds, contactIds } = await req.json();
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds is required" }, { status: 400 });
  }
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "Select at least one client contact" }, { status: 400 });
  }

  const { data: mandate, error: mandateError } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, client_id")
    .eq("id", mandateId)
    .single();
  if (mandateError || !mandate) {
    return NextResponse.json({ error: "Mandate not found" }, { status: 404 });
  }
  if (!mandate.client_id) {
    return NextResponse.json({ error: "This mandate isn't linked to a client record yet, so it has no contacts to email." }, { status: 400 });
  }

  // Scope contacts to THIS mandate's client -- contactIds coming from the
  // request body could otherwise be tampered with to email someone else's
  // client contact.
  const { data: contacts } = await supabase
    .from("client_contacts")
    .select("id, full_name, email")
    .eq("client_id", mandate.client_id)
    .in("id", contactIds);
  const validContacts = (contacts ?? []).filter((c): c is { id: string; full_name: string; email: string } => !!c.email);
  if (validContacts.length === 0) {
    return NextResponse.json({ error: "None of the selected contacts have an email on file." }, { status: 400 });
  }

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "id, stage, candidates(id, full_name, category, sub_domain, total_experience_years, current_fixed_ctc, current_employer, resume_file_url)"
    )
    .eq("mandate_id", mandateId)
    .in("candidate_id", candidateIds);
  const targetLinks = (links ?? []).filter((l) => l.candidates);
  if (targetLinks.length === 0) {
    return NextResponse.json({ error: "No matching candidates found on this mandate." }, { status: 404 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { error: "Email sending is not configured yet (missing GMAIL_USER / GMAIL_APP_PASSWORD on the server)." },
      { status: 503 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = serviceKey ? createSupabaseClient(supabaseUrl, serviceKey) : null;

  // Reuse the mandate's existing no-login shortlist link if one's already
  // been generated (Sharing tab); otherwise mint one now so the email
  // always has a working link, rather than making the recruiter go
  // generate it separately first.
  let token: string;
  const { data: existingToken } = await supabase.from("shortlist_tokens").select("token").eq("mandate_id", mandateId).maybeSingle();
  if (existingToken?.token) {
    token = existingToken.token;
  } else {
    token = crypto.randomUUID().replace(/-/g, "");
    await supabase.from("shortlist_tokens").insert({ token, mandate_id: mandateId });
  }
  // Hardcoded to the branded client-facing subdomain rather than
  // req.nextUrl.origin -- otherwise this would follow whatever host the
  // recruiter happened to be on (e.g. the raw .vercel.app URL) instead of
  // always handing clients the short, branded link.
  const shortlistUrl = `https://clients.staffanchor.com/shortlist/${token}`;

  type Cand = {
    id: string;
    full_name: string;
    category: string | null;
    sub_domain: string | null;
    total_experience_years: number | null;
    current_fixed_ctc: number | null;
    current_employer: string | null;
    resume_file_url: string | null;
  };
  const candidates = targetLinks.map((l) => l.candidates as unknown as Cand);

  // Resume attachments -- best-effort per candidate; a missing/unreadable
  // resume never blocks the email, it just isn't attached and shows up in
  // `resumeless` so the recruiter knows to chase it down separately.
  const attachments: { filename: string; content: Buffer }[] = [];
  const resumeless: string[] = [];
  if (admin) {
    for (const c of candidates) {
      if (!c.resume_file_url) {
        resumeless.push(c.full_name);
        continue;
      }
      const cleanPath = c.resume_file_url.replace(/^resumes\//, "");
      try {
        const { data: fileData, error: downloadError } = await admin.storage.from("resumes").download(cleanPath);
        if (downloadError || !fileData) {
          resumeless.push(c.full_name);
          continue;
        }
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const ext = cleanPath.includes(".") ? cleanPath.slice(cleanPath.lastIndexOf(".")) : ".pdf";
        const safeName = c.full_name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "Candidate";
        attachments.push({ filename: `${safeName} - Resume${ext}`, content: buffer });
      } catch {
        resumeless.push(c.full_name);
      }
    }
  } else {
    resumeless.push(...candidates.map((c) => c.full_name));
  }

  const greeting = validContacts.length === 1 ? `Hi ${validContacts[0].full_name.split(" ")[0]}` : "Hi Team";

  const candidateLines = candidates
    .map((c) => {
      const bits = [
        c.sub_domain ?? c.category?.replace(/_/g, " "),
        c.total_experience_years != null ? `${c.total_experience_years} yrs exp` : null,
        c.current_employer ? `currently at ${c.current_employer}` : null,
        c.current_fixed_ctc != null ? `₹${c.current_fixed_ctc}L fixed CTC` : null,
      ].filter(Boolean);
      return `${c.full_name}${bits.length ? ` — ${bits.join(", ")}` : ""}`;
    })
    .join("\n");
  const candidateListHtml = candidates
    .map((c) => {
      const bits = [
        c.sub_domain ?? c.category?.replace(/_/g, " "),
        c.total_experience_years != null ? `${c.total_experience_years} yrs exp` : null,
        c.current_employer ? `currently at ${c.current_employer}` : null,
        c.current_fixed_ctc != null ? `₹${c.current_fixed_ctc}L fixed CTC` : null,
      ].filter(Boolean);
      return `<li><strong>${c.full_name}</strong>${bits.length ? ` — ${bits.join(", ")}` : ""}</li>`;
    })
    .join("");

  const recruiterName = profile.full_name ?? "The StaffAnchor Team";
  const subject = `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} shared for ${mandate.role_title} — ${mandate.client_name}`;

  const text = `${greeting},\n\nPlease find below the candidate${candidates.length === 1 ? "" : "s"} we'd like to submit for ${mandate.role_title}${
    candidates.length === 1 ? "'s" : ""
  }:\n\n${candidateLines}\n\nResumes are attached${resumeless.length > 0 ? ` (resume not on file yet for: ${resumeless.join(", ")})` : ""}.\n\nYou can also review the full shortlist, with more detail on each candidate, here: ${shortlistUrl}\n(Opening it will ask you to verify this email address with a one-time code -- that's expected, it's how we keep the shortlist private to this client.)\n\nLet us know your thoughts whenever convenient.\n\nThanks,\n${recruiterName}\nStaffAnchor`;

  const html = `<p>${greeting},</p>
<p>Please find below the candidate${candidates.length === 1 ? "" : "s"} we'd like to submit for <strong>${mandate.role_title}</strong>:</p>
<ul>${candidateListHtml}</ul>
<p>Resumes are attached${resumeless.length > 0 ? ` (resume not on file yet for: ${resumeless.join(", ")})` : ""}.</p>
<p>You can also review the full shortlist, with more detail on each candidate, here: <a href="${shortlistUrl}">${shortlistUrl}</a></p>
<p style="color:#94a3b8;font-size:12px;">Opening it will ask you to verify this email address with a one-time code -- that's expected, it's how we keep the shortlist private to this client.</p>
<p>Let us know your thoughts whenever convenient.</p>
<p>Thanks,<br/>${recruiterName}<br/>StaffAnchor</p>`;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"StaffAnchor" <${gmailUser}>`,
      to: validContacts.map((c) => c.email).join(", "),
      subject,
      text,
      html,
      attachments,
    });
  } catch (err) {
    console.error("Email-to-client send failed", mandateId, err);
    return NextResponse.json({ error: "Failed to send the email. Please try again." }, { status: 500 });
  }

  // Mark every emailed candidate as submitted-to-client + in shortlist --
  // same auto-advance-never-downgrade rule the table's own shortlist toggle
  // follows, so someone already at client_interview or further doesn't get
  // dragged backwards just because they were included in this email too.
  for (const link of targetLinks) {
    const cand = link.candidates as unknown as Cand;
    const alreadyFurther = (STAGE_ORDER[link.stage] ?? 0) >= STAGE_ORDER["submitted"];
    await supabase.from("candidate_mandate_links").update({ in_shortlist: true }).eq("id", link.id);
    if (!alreadyFurther) {
      try {
        await applyStageChange(supabase, {
          linkId: link.id,
          candidateId: cand.id,
          mandateId,
          candidateName: cand.full_name,
          mandateLabel: `${mandate.role_title} — ${mandate.client_name}`,
          previousStage: link.stage,
          newStage: "submitted",
          source: "recruiter",
        });
      } catch (e) {
        console.error("Failed to sync stage after client email", link.id, e);
      }
    }
  }

  await supabase.from("audit_log").insert({
    actor: user.id,
    action: "candidates_emailed_to_client",
    entity: "mandate",
    entity_id: mandateId,
    detail: {
      to: validContacts.map((c) => c.email),
      candidates: candidates.map((c) => c.full_name),
      resumeless,
    },
  });

  return NextResponse.json({
    ok: true,
    sentTo: validContacts.map((c) => c.full_name),
    candidateCount: candidates.length,
    resumeless,
  });
}
