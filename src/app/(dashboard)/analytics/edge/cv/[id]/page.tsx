import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, formatIst } from "@/lib/pro-sessions/core";
import { COLUMNS, jobsLink, type BriefRow } from "@/lib/cv-brief/store";
import { SCOPE_TEXT, describeJob, monthLabel, formatMetric, gaps, jobFilled, jobPeriod, keyItems, progress, sanitize, winDone, type Job } from "@/lib/cv-brief/config";
import CopyBox from "./copy-box";
import ReminderButton from "./reminder-button";
import GenerateButton from "./generate-button";
import { STATUS_LABEL, type DocStatus } from "@/lib/cv-doc/types";
import { ago, briefState } from "@/lib/cv-brief/state";
import { reminderDefault } from "@/lib/cv-brief/mail";

export const dynamic = "force-dynamic";

// Called only after the page has been rendered, so the clock read stays out of the render body.
function nowMs() {
  return Date.now();
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      <div className="mt-3 space-y-3 text-[13px]">{children}</div>
    </section>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (v === "" || v === null || v === undefined || (Array.isArray(v) && v.length === 0) ? null : (
  <div className="grid gap-1 md:grid-cols-[170px_1fr]">
    <dt className="text-xs text-slate-400">{k}</dt>
    <dd className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{v}</dd>
  </div>
));

const Chips = ({ items }: { items: string[] }) => (items.length ? <span className="flex flex-wrap gap-1.5">{items.map((i) => <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{i}</span>)}</span> : "");

function JobView({ j, n }: { j: Job; n: number }) {
  const withNumbers = j.metrics.filter((m) => m.amount !== null || !!m.range);
  const items = keyItems(j, n < 2);
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{j.title || "Role not given"}{j.employer ? `, ${j.employer}` : ""}</p>
        <p className="text-xs text-slate-500">{jobPeriod(j) || "Dates not given"}{j.city ? ` · ${j.city}` : ""}{n === 0 ? " · latest" : ""}{j.fromCv ? " · read from CV" : ""}</p>
      </div>
      <p className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
        {items.map((k) => <span key={k.id} className={`rounded-full px-2 py-0.5 ${k.done ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200"}`}>{k.done ? "✓" : "Missing:"} {k.label}</span>)}
      </p>
      <dl className="mt-3 space-y-2">
        {j.positions.length > 1 ? (
          <div className="grid gap-1 md:grid-cols-[170px_1fr]">
            <dt className="text-xs text-slate-400">Roles here (promotion path)</dt>
            <dd>
              <ul className="space-y-0.5">
                {j.positions.map((p) => <li key={p.id}>{p.title || "Title not given"}{p.level ? <span className="text-slate-500"> · {p.level}</span> : null}<span className="text-slate-500"> · {[monthLabel(p.start), p.current ? "Present" : monthLabel(p.end)].filter(Boolean).join(" – ")}</span></li>)}
              </ul>
            </dd>
          </div>
        ) : null}
        <Row k="Type of role" v={[j.fn, j.positions.length > 1 ? "" : j.level].filter(Boolean).join(" · ")} />
        <Row k="Notable customers" v={j.clients} />
        <Row k="Sales target" v={j.noTarget ? "Did not carry a target" : ""} />
        <Row k="Industry" v={j.industry} />
        <Row k="What they sold" v={j.sells} />
        <Row k="Business model" v={<Chips items={j.model} />} />
        <Row k="Sold to" v={<Chips items={j.customers} />} />
        <Row k="Dealt with" v={<Chips items={j.buyers} />} />
        <Row k="How they sold" v={<Chips items={j.motion} />} />
        <Row k="Channels" v={<Chips items={j.channels} />} />
        {j.processes.length > 0 && (
          <div className="grid gap-1 md:grid-cols-[170px_1fr]">
            <dt className="text-xs text-slate-400">Processes run</dt>
            <dd>
              <ul className="space-y-0.5">
                {j.processes.map((p) => <li key={p.key}>{p.label}{[p.volume && `${p.volume} a month`, p.role].filter(Boolean).length ? <span className="text-slate-500"> · {[p.volume && `${p.volume} a month`, p.role].filter(Boolean).join(" · ")}</span> : null}</li>)}
              </ul>
            </dd>
          </div>
        )}
        <Row k="Parts of the sale owned" v={<Chips items={j.stages} />} />
        <Row k="Direct or partners" v={j.route} />
        <Row k="Sales cycle" v={j.cycle} />
        <Row k="Reported to" v={j.reportsTo} />
        <Row k="Geography" v={j.geography} />
        {withNumbers.length > 0 && (
          <div className="grid gap-1 md:grid-cols-[170px_1fr]">
            <dt className="text-xs text-slate-400">Numbers</dt>
            <dd>
              <ul className="space-y-1">
                {withNumbers.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{m.label}:</span> {formatMetric(m)}
                    {m.note ? <span className="text-slate-500"> ({m.note})</span> : null}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <Row k="Growth" v={[j.growth.from && `from ${j.growth.from}`, j.growth.to && `to ${j.growth.to}`, j.growth.period && `in ${j.growth.period}`].filter(Boolean).join(" ")} />
        <Row k="Managed people" v={j.manages === "yes" ? "Yes" : j.manages === "no" ? "No" : ""} />
        {j.manages === "yes" && (
          <>
            <Row k="Direct reports" v={j.team.direct !== null ? String(j.team.direct) : ""} />
            <Row k="Whole team" v={j.team.total !== null ? String(j.team.total) : ""} />
            <Row k="Team made up of" v={<Chips items={j.composition} />} />
            <Row k="Duties as a leader" v={<Chips items={j.leads} />} />
            <Row k="Layers" v={j.team.layers} />
            <Row k="Hiring" v={j.team.hired} />
            <Row k="Attrition" v={j.team.attrition} />
            <Row k="Team notes" v={j.team.note} />
          </>
        )}
        <Row k="Tools" v={<Chips items={j.tools} />} />
        <Row k="Processes" v={j.process} />
        {j.wins.filter(winDone).map((w, i) => (
          <Row key={w.id} k={`Achievement ${i + 1}${w.type ? ` (${w.type})` : ""}`} v={[w.text, w.result && `Result: ${w.result}`].filter(Boolean).join("\n")} />
        ))}
        <Row k="Promotions" v={j.promoted} />
        <Row k="How it reads" v={<span className="block rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{describeJob(j, n < 2).lines.filter((l) => !l.ghost).map((l) => l.text).join(" ")}</span>} />
        <Row k="Anything else" v={j.extra} />
      </dl>
    </div>
  );
}

export default async function CvBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await db.from("cv_briefs").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as BriefRow;
  const d = sanitize(b.data);
  const link = jobsLink(b.token);
  const first = b.name.trim().split(/\s+/)[0] || "there";
  const message = [
    `Hi ${first},`,
    "To write your CV well, I need a few details about your sales career. It takes about 10 to 15 minutes, your answers save as you go, and you can come back to the same link any time.",
    link,
    "Start by uploading your current CV and it will fill in your jobs for you. Nothing is compulsory, so skip anything you can't share.",
    "Regards,\nStaffAnchor Talent Solutions",
  ].join("\n\n");
  const photoUrl = b.photo_path ? (await db.storage.from("resume-orders").createSignedUrl(b.photo_path, 3600)).data?.signedUrl ?? null : null;
  const { data: docRows } = await db.from("cv_docs").select("id, version, status, updated_at").eq("brief_id", b.id).order("version", { ascending: false });
  const docs = (docRows ?? []) as { id: string; version: number; status: DocStatus; updated_at: string }[];
  const cvUrl = b.cv_path ? (await db.storage.from("resume-orders").createSignedUrl(b.cv_path, 3600)).data?.signedUrl ?? null : null;
  const now = nowMs();
  const st = briefState(b, now);
  const remindTo = (b.email ?? d.basics.email ?? "").trim();
  const recentlyReminded = !!b.last_reminded_at && now - new Date(b.last_reminded_at).getTime() < 24 * 60 * 60 * 1000;
  const missing = gaps(d);
  const jobs = d.jobs.filter(jobFilled);
  const t = d.targets;
  const money = (n: number | null) => (n === null ? "" : `₹${n} LPA`);

  return (
    <div className="mx-auto max-w-[900px] space-y-4 px-5 py-8">
      <Link href="/analytics/edge" className="text-xs text-teal-700 hover:underline dark:text-teal-400">← StaffAnchor Edge</Link>
      <div>
        <h1 className="ros-page-title">{b.name}: Sales CV form</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
          {st.nudge && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">Time for a nudge</span>}
          <span>{progress(d)}% of the key details are in</span>
          {b.opened_at && b.status !== "submitted" && <span>· opened {b.open_count} {b.open_count === 1 ? "time" : "times"}, last {ago(b.last_opened_at ?? b.opened_at, now)}</span>}
          {b.updated_at && b.status !== "sent" && <span>· last saved {formatIst(new Date(b.updated_at))} IST</span>}
          {b.submitted_at && <span>· submitted {formatIst(new Date(b.submitted_at))} IST{b.submit_count > 1 ? ` (${b.submit_count} times)` : ""}</span>}
        </p>
      </div>

      <Section title="Send it to the candidate" sub="Nothing is sent from here. Copy the message, check it, and send it yourself by email or WhatsApp.">
        <CopyBox label="Their private link" value={link} />
        <CopyBox label="Message to send" value={message} rows={9} />
        <p className="text-xs text-slate-400">The link is only theirs: it shows nothing but their own answers. Anyone who has it can fill the form, so send it only to them.</p>
      </Section>

      {b.status !== "submitted" && (
        <Section title="Not submitted yet" sub={b.reminder_count > 0 ? `Reminded ${b.reminder_count} ${b.reminder_count === 1 ? "time" : "times"}, last ${ago(b.last_reminded_at ?? b.created_at, now)}${b.last_reminded_to ? ` (${b.last_reminded_to})` : ""}.` : "No reminder sent yet."}>
          <ReminderButton id={b.id} name={b.name} to={remindTo} message={reminderDefault(b.name, b.token, st.key === "submitted" ? "sent" : st.key)} recent={recentlyReminded} />
          {!remindTo && <p className="text-xs text-amber-700">No email address on file, so type one in the reminder box, or copy the message above and send it by WhatsApp.</p>}
        </Section>
      )}
      {b.status === "submitted" && b.received_email_at && <p className="text-xs text-slate-400">The candidate was emailed a receipt on {formatIst(new Date(b.received_email_at))} IST.</p>}

      {b.status !== "sent" && (
        <>
          <Section title="CV drafts" sub="Written only from what the candidate told us. You edit it, approve it, then share it with them to review.">
            {docs.length > 0 && (
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/analytics/edge/cv/${b.id}/doc/${d.id}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">Version {d.version}</Link>
                    <span className="text-xs text-slate-500">{STATUS_LABEL[d.status]} · updated {formatIst(new Date(d.updated_at))} IST</span>
                  </li>
                ))}
              </ul>
            )}
            <GenerateButton briefId={b.id} hasDrafts={docs.length > 0} submitted={b.status === "submitted"} />
          </Section>

          <Section title="Consent and CV file">
            <Row k="Profile consent" v={b.consent_at ? `Ticked ${formatIst(new Date(b.consent_at))} IST (wording ${b.consent_version})` : "Not given. Do not create a StaffAnchor profile from this form."} />
            <Row k="Photo" v={photoUrl ? <span className="flex items-center gap-3"><a href={photoUrl} target="_blank"><img src={photoUrl} alt="Candidate photo" className="h-16 w-16 rounded-xl object-cover" /></a><span className="text-slate-500">{d.extras.photoPref || "Wants it on the CV: not answered"}</span></span> : d.extras.photoPref ? `No photo uploaded. They said: ${d.extras.photoPref}` : ""} />
            <Row k="Uploaded CV" v={cvUrl ? <a href={cvUrl} target="_blank" className="text-teal-700 hover:underline dark:text-teal-400">{b.cv_name ?? "Download"}</a> : "None uploaded"} />
            <Row k="StaffAnchor profile" v={b.candidate_id ? <Link href={`/candidates/${b.candidate_id}`} className="text-teal-700 hover:underline dark:text-teal-400">Open profile</Link> : "No matching profile found by email or phone"} />
          </Section>

          {missing.length > 0 && (
            <Section title="Still worth asking" sub="Suggestions from what is missing in their latest two jobs. None of it blocks the form.">
              <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </Section>
          )}

          <Section title="About them" sub="Typed or confirmed by the candidate. Figures are self-reported, so check them before they go on a CV.">
            <dl className="space-y-2">
              <Row k="Name" v={d.basics.name} />
              <Row k="Email" v={d.basics.email} />
              <Row k="Phone" v={d.basics.phone} />
              <Row k="City" v={d.basics.city} />
              <Row k="Now" v={[d.basics.title, d.basics.employer].filter(Boolean).join(", ")} />
              <Row k="Experience" v={d.basics.expYears !== null ? `${d.basics.expYears} years` : ""} />
              <Row k="Status" v={d.basics.status} />
              <Row k="Education" v={d.basics.educations.length ? <ul className="space-y-0.5">{d.basics.educations.map((e, i) => <li key={i}>{[e.degree, e.institution, e.year].filter(Boolean).join(", ")}</li>)}</ul> : [d.basics.education, d.basics.educationDetail].filter(Boolean).join(": ")} />
              <Row k="LinkedIn" v={d.basics.linkedin} />
            </dl>
          </Section>

          <Section title={`Jobs (${jobs.length})`} sub="Newest first.">
            {jobs.length === 0 ? <p className="text-slate-400">No jobs added yet.</p> : jobs.map((j, i) => <JobView key={j.id} j={j} n={i} />)}
          </Section>

          <Section title="How they see themselves" sub="Their own words, picked and typed by them. Use these to write the CV summary.">
            <dl className="space-y-2">
              <Row k="Words they chose" v={<Chips items={d.story.strengths} />} />
              <Row k="Selling style" v={d.story.style} />
              <Row k="Known for" v={d.story.knownFor} />
              <Row k="Want from the next role" v={<Chips items={d.story.wantNext} />} />
              <Row k="CV headline they wrote" v={d.story.headline} />
            </dl>
          </Section>

          <Section title="What they want next">
            <dl className="space-y-2">
              <Row k="Roles" v={t.roles} />
              <Row k="Levels" v={<Chips items={t.levels} />} />
              <Row k="Industries" v={<Chips items={t.industries} />} />
              <Row k="Company types" v={<Chips items={t.companyTypes} />} />
              <Row k="Cities" v={t.cities} />
              <Row k="Relocation" v={t.relocate} />
              <Row k="Travel" v={t.travel} />
              <Row k="Work mode" v={t.workMode} />
              <Row k="Type" v={t.empType} />
              <Row k="Notice" v={t.notice} />
              <Row k="Current pay" v={[money(t.currentFixed) && `${money(t.currentFixed)} fixed`, money(t.currentVariable) && `${money(t.currentVariable)} variable`].filter(Boolean).join(" + ")} />
              <Row k="Expected pay" v={[money(t.expectedFixed) && `${money(t.expectedFixed)} fixed`, money(t.expectedVariable) && `${money(t.expectedVariable)} variable`].filter(Boolean).join(" + ")} />
              <Row k="Wants to avoid" v={t.avoid} />
              <Row k="Notes" v={t.note} />
            </dl>
          </Section>

          <Section title="For the CV">
            <dl className="space-y-2">
              <Row k="Length" v={d.extras.cvPages} />
              <Row k="Leave out" v={d.extras.cvAvoid} />
              <Row k="Certifications" v={d.extras.certifications} />
              <Row k="Languages" v={<Chips items={d.extras.languages} />} />
              <Row k="Awards" v={d.extras.awards} />
              <Row k="Some figures are confidential" v={d.extras.confidential ? "Yes. Use broad numbers." : ""} />
              <Row k="Gaps or moves to explain (not for the CV)" v={d.extras.gaps} />
              <Row k="Anything else" v={d.extras.anything} />
            </dl>
          </Section>
          <p className="text-xs text-slate-400">Numbers show who they belong to: {Object.values(SCOPE_TEXT).join(", ")}. Team and business figures must never be written as the candidate&apos;s own.</p>
        </>
      )}
    </div>
  );
}
