// @ts-nocheck
// Run: node scripts/check-session-report.mts   (checks the session report rules: clean-up of what the browser sends, what is
// counted as filled, what goes into the PDF, and the prompts for each kind of role)
import * as c from "../src/lib/session-report/config.ts";
let failed = 0;
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { failed++; console.log("FAIL", m, "got", JSON.stringify(a), "wanted", JSON.stringify(b)); } else console.log("ok", m); };

// clean-up
eq(c.sanitize(null), c.emptyData(), "nothing sent gives the empty report");
eq(c.sanitize("junk").snapshot.currentRole, "", "a wrong type becomes an empty string");
eq(c.sanitize({ snapshot: { currentRole: 123 } }).snapshot.currentRole, "", "a number is not accepted as text");
eq(c.sanitize({ goal: { goal: "x".repeat(5000) } }).goal.goal.length, 1500, "long text is cut to its limit");
eq(c.sanitize({ diagnosis: { targeting: { rating: "excellent", note: "n" } } }).diagnosis.targeting.rating, null, "an unknown rating is dropped");
eq(c.sanitize({ diagnosis: { targeting: { rating: "needs_work", note: "n" } } }).diagnosis.targeting.rating, "needs_work", "a known rating is kept");
eq(c.sanitize({ market: { targets: Array.from({ length: 40 }, () => ({ company: "a" })) } }).market.targets.length, 15, "at most 15 target companies");
eq(c.sanitize({ actions: { items: Array.from({ length: 40 }, () => ({ action: "a" })) } }).actions.items.length, 8, "at most 8 actions");
eq(c.sanitize({ market: { targets: [] } }).market.targets.length, 1, "an empty list still gets one blank row to type into");
eq(c.sanitize({ include: { market: false } }).include.market, false, "switching a section off is kept");
eq(c.sanitize({ include: { market: "no" } }).include.market, true, "anything but false leaves a section on");
eq(Object.keys(c.sanitize({ positioning: { proof: Object.fromEntries(Array.from({ length: 80 }, (_, i) => ["k" + i, "v"])) } }).positioning.proof).length, 30, "at most 30 proof points");
eq(c.sanitize({ privateNotes: "p".repeat(20000) }).privateNotes.length, 8000, "private notes are capped");
eq(c.sanitize({ __proto__: { evil: 1 }, snapshot: { constructor: "x" } }).snapshot.currentRole, "", "odd keys do nothing");

// what counts as filled, and what goes into the PDF
const empty = c.emptyData();
eq(Object.values(c.filled(empty)).some(Boolean), false, "an empty report has no filled parts");
eq(c.reportSections(empty), [], "an empty report prints no sections");
const d = c.emptyData();
d.positioning.story = "I built a team";
d.actions.inShort = "Short note";
eq(c.filled(d).positioning && c.filled(d).actions, true, "a story and a summary count as filled");
eq(c.reportSections(d), ["positioning", "actions"], "only the filled parts print, in meeting order");
d.include.positioning = false;
eq(c.reportSections(d), ["actions"], "a part switched off does not print even when filled");
const e = c.emptyData();
e.diagnosis.channel.rating = "ok";
eq(c.filled(e).diagnosis, true, "a rating alone counts as a filled diagnosis");
const f = c.emptyData();
f.privateNotes = "secret";
eq(Object.values(c.filled(f)).some(Boolean), false, "private notes never make a section count");
eq(c.reportSections(f), [], "private notes never print");
const g = c.emptyData();
g.market.targets = [{ company: "", why: "", route: "" }];
eq(c.filled(g).market, false, "blank target rows do not count");

// prompts by kind of role
eq(c.proofFields("sales", "individual").length, 6, "sales, individual: 6 prompts");
eq(c.proofFields("sales", "manager").length, 10, "sales, manager: 6 plus 4 leadership prompts");
eq(c.proofFields("sales", "leader").length, 10, "sales, leader: the same 10");
eq(c.proofFields("non_sales", "individual").length, 5, "non-sales, individual: 5 prompts");
eq(c.proofFields("non_sales", "leader").length, 8, "non-sales, leader: 5 plus 3");
eq(c.proofFields("sales", "individual").some((p) => p.key === "quota"), true, "sales asks for quota attainment");
eq(c.proofFields("non_sales", "individual").some((p) => p.key === "quota"), false, "non-sales does not ask for quota");
eq(new Set(c.proofFields("sales", "leader").map((p) => p.key)).size, 10, "no prompt is repeated");

// starting values
const p = c.prefill({ experience_years: 10, target_role: "Cluster Head" }, { currentRole: "Regional Manager", currentCompany: "Acme", experience: "10", targetRole: "Regional Head", targetIndustry: "SaaS", other: "ignored" });
eq([p.snapshot.currentRole, p.snapshot.currentCompany, p.snapshot.targetRoles, p.snapshot.targetIndustries], ["Regional Manager", "Acme", "Regional Head", "SaaS"], "the details form fills the snapshot");
eq(c.prefill({ experience_years: 7, target_role: "Account Manager" }, null).snapshot.targetRoles, "Account Manager", "with no form, the booking's target role is used");
eq(c.prefill({ experience_years: null, target_role: null }, null), c.emptyData(), "nothing known gives the empty report");
eq(c.SECTIONS.length, 7, "seven sections in the meeting");
eq(c.SECTIONS.map((s) => s.key), ["snapshot", "diagnosis", "market", "positioning", "outreach", "resume", "actions"], "sections are in meeting order");
console.log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
process.exitCode = failed ? 1 : 0;
