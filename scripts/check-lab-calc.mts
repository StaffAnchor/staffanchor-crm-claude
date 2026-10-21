// @ts-nocheck
// Run: node scripts/check-lab-calc.mts   (checks every calculated figure in the Sales Leaders Lab against the workbook examples)
import * as c from "../src/lib/lab/calc.ts";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log("FAIL", m, a, b); process.exitCode = 1; } else console.log("ok", m); };
const row = { follow_up_ontime: { baseline: 60, endline: 78 }, review_freq: { baseline: 50, endline: 80 }, call_quality: { baseline: 62, endline: 74 }, forecast_accuracy: { baseline: 70, endline: 82 } };
eq(c.measuresImproved(row), 4, "cohort row improves 4 measures");
eq(c.cohortRollup([{ memberId: "a", values: row }, { memberId: "b", values: { follow_up_ontime: { baseline: 60, endline: 50 } } }]).improvingOn3Plus, 1, "roll-up counts 3+ improvers");
eq(c.resultOf({ baseline: 5, endline: 5 }), "No change", "no change");
eq(c.resultOf({ baseline: 5, endline: 4 }), "Slipped", "slipped");
eq(c.auditScore([true,true,false,true,false,false,true,true,true]), 6, "pipeline audit Y,Y,N,Y,N,N,Y,Y,Y = 6");
eq(c.forecastAccuracy(100, 88), 88, "forecast accuracy 88");
eq(c.forecastRead(88), "Over-called", "88 over-called");
eq(c.forecastRead(100), "Accurate", "100 accurate");
eq(c.forecastRead(110), "Under-called", "110 under-called");
eq(c.onTimePct(10, 8), 80, "8 of 10 = 80%");
eq(c.bandOf(8), "Developing", "8 months developing");
eq(c.bandOf(2), "Ramp up", "2 months ramp up");
eq(c.bandOf(20), "Established", "20 months established");
eq(c.bandingFocus(70), "Diagnose: skill, will or system", "below 80");
eq(c.weightedScore({ opening: 5, discovery: 5, listening: 5, objections: 5, value: 5, next_step: 5, compliance: 5 }), 100, "all fives = 100");
eq(c.weightedScore({ opening: 3, discovery: 3, listening: 3, objections: 3, value: 3, next_step: 3, compliance: 3 }), 60, "all threes = 60");
eq(c.calibration({ a: 4, b: 2, c: 3 }, { a: 2, b: 2, c: 5 }, ["a","b","c"]).bigGaps, 2, "calibration gaps of 2+");
eq(c.attritionCost(3, 150000), 450000, "attrition cost");
eq(c.progressPct({ profileDone: true, baselineEntered: 4, endlineEntered: 0, sessionsHeld: 2, attended: 2, assignmentsDone: 1 }), 10+25+25+10, "progress");

const dealA = { answers: [true,true,false,true,false,false,true,true,true] };
const dealB = { answers: [true,false,false,true,true,true,true,true,true] };
const sum = c.auditSummary([dealA, dealB, { answers: [true, null, null, null, null, null, null, null, null] }]);
eq(sum.completed, 2, "audit: two complete deals, the half-filled one is left out");
eq(sum.avgScore, 6.5, "audit: average of 6 and 7 is 6.5");
eq(sum.noCounts, [0,1,2,0,1,1,0,0,0], "audit: counts of No per check");
eq(sum.weakestIndex, 2, "audit: weakest check is number 3 (decision maker known)");
eq(c.auditSummary([]).avgScore, null, "audit: nothing entered");
eq(c.auditComplete([true,true,true,true,true,true,true,true,null]), false, "audit: incomplete");

const W = c.SCORECARD_DEFAULT;
const five = { opening: 5, discovery: 5, listening: 5, objections: 5, value: 5, next_step: 5, compliance: 5 };
const three = { opening: 3, discovery: 3, listening: 3, objections: 3, value: 3, next_step: 3, compliance: 3 };
const mixed = { ...five, discovery: 2 };
eq(c.weightedScore(mixed), 88, "scorecard: discovery rated 2 costs 12 points, 88");
const cs = c.callSummary([{ repRef: "R1", ratings: five }, { repRef: "R1", ratings: three }, { repRef: "R2", ratings: mixed }, { repRef: "R3", ratings: { opening: 4 } }], W);
eq(cs.calls, 3, "calls: an incomplete call is left out");
eq(cs.reps, 2, "calls: two reps with scored calls");
eq(cs.avgScore, 82.7, "calls: average of 100, 60 and 88 is 82.7");
eq(cs.perRep.find((r) => r.rep === "R1")?.avg, 80, "calls: rep R1 averages 80");
eq(cs.weakestKey, "discovery", "calls: discovery is the lowest-rated criterion");
eq(cs.perCriterion.find((x) => x.key === "discovery")?.avgRating, 3.3, "calls: discovery average rating 3.3");
eq(c.weightsFor({ scorecard_weights: { discovery: 25, opening: 5 } }).find((x) => x.key === "discovery")?.weight, 25, "weights: cohort override");
eq(c.weightsValid(c.weightsFor(null)), true, "weights: defaults add to 100");
eq(c.weightsValid(c.weightsFor({ scorecard_weights: { discovery: 25 } })), false, "weights: must add to 100");
eq(c.weightedScore(five, c.weightsFor({ scorecard_weights: { discovery: 25, opening: 5 } })), 100, "weights: all fives still 100 with custom weights");

const ca = { opening: 4, discovery: 2, listening: 3, objections: 4, value: 3, next_step: 5, compliance: 4 };
const cb = { opening: 4, discovery: 4, listening: 3, objections: 2, value: 3, next_step: 4, compliance: 4 };
const cal = c.calibration(ca, cb);
eq(cal.bigGaps, 2, "calibration: discovery and objections differ by 2");
eq(cal.avgGap, 0.7, "calibration: average gap is 5 over 7, 0.7");
const cs2 = c.calibrationSummary([{ a: ca, b: cb }, { a: three, b: three }]);
eq(cs2.compared, 2, "calibration summary: two compared calls");
eq(cs2.avgGap, 0.4, "calibration summary: average of 0.7 and 0 is 0.4 (rounded)");
eq(cs2.per.find((x) => x.key === "discovery")?.bigGapPct, 50, "calibration summary: discovery 2+ apart on half the calls");
eq(cs2.mostDisagreedKey === "discovery" || cs2.mostDisagreedKey === "objections", true, "calibration summary: most disagreed criterion found");
eq(c.calibrationSummary([]).avgGap, null, "calibration summary: nothing compared");

const fs = c.forecastSummary([
  { month: "2026-03-01", commit: 100, actual: 88 },
  { month: "2026-04-01", commit: 100, actual: 100 },
  { month: "2026-05-01", commit: 100, actual: 110 },
  { month: "2026-06-01", commit: 100, actual: null },
  { month: "2026-07-01", commit: 0, actual: 50 },
]);
eq(fs.months, 3, "forecast: months with commit and actual (a future month and a zero commit are left out)");
eq(fs.avgAccuracy, 99, "forecast: average of 88, 100 and 110 is 99");
eq(fs.withinBand, 1, "forecast: one month within 95 to 105");
eq([fs.over, fs.under], [1, 1], "forecast: one over-called, one under-called");
eq(c.forecastSummary([{ month: "m", commit: 100, actual: 108 }], { low: 90, high: 110 }).withinBand, 1, "forecast: a wider band counts 108 as accurate");
eq(c.bandFor({ forecast_band: { low: 90, high: 110 } }), { low: 90, high: 110 }, "forecast: cohort band override");
eq(c.bandFor(null), { low: 95, high: 105 }, "forecast: default band");
eq(c.bandFor({ forecast_band: { low: 120, high: 100 } }), { low: 95, high: 105 }, "forecast: an inverted band falls back to the default");

const rs = c.reviewSummary([
  { rootCause: "system", actionLogged: true, followUpOn: "2026-03-13", followedUp: true },
  { rootCause: "skill", actionLogged: false, followUpOn: "2026-03-20", followedUp: false },
  { rootCause: "system", actionLogged: true, followUpOn: "2026-12-01", followedUp: false },
  { rootCause: null, actionLogged: null },
], "2026-06-01");
eq(rs.total, 4, "reviews: four preps");
eq(rs.actionLoggedPct, 67, "reviews: two of three answered were logged, 67%");
eq(rs.causes, { skill: 1, will: 0, system: 2, unclear: 0 }, "reviews: root-cause mix");
eq([rs.followUps, rs.followedUp, rs.overdue], [3, 1, 1], "reviews: follow-ups, done, and one overdue");
eq(c.reviewSummary([]).actionLoggedPct, null, "reviews: nothing entered");
eq(c.REVIEW_QUESTIONS.length, 5, "reviews: five standard questions");

const cp = c.coachingSummary([
  { repRef: "R1", gap: "skill", followUpOn: "2026-03-13", followedUp: true },
  { repRef: "r1", gap: "will", followUpOn: "2026-03-20", followedUp: false },
  { repRef: "R2", gap: "system", followUpOn: "2026-12-01", followedUp: false },
  { repRef: "R3", gap: null },
], "2026-06-01");
eq(cp.total, 4, "coaching: four conversations");
eq(cp.reps, 3, "coaching: R1 and r1 are the same rep, so three reps");
eq(cp.gaps, { skill: 1, will: 1, system: 1, unclear: 0 }, "coaching: gap mix");
eq(cp.systemSharePct, 33, "coaching: one of three classified gaps was a system gap");
eq([cp.followUps, cp.followedUp, cp.overdue], [3, 1, 1], "coaching: follow-ups, done, one overdue");
eq(c.coachingSummary([]).systemSharePct, null, "coaching: nothing entered");

const oo = c.oneOnOneSummary([
  { repRef: "R1", commitment: "Send written next step after every call", dueOn: "2026-03-13", done: true },
  { repRef: "R1", commitment: "Ask about budget on 5 calls", dueOn: "2026-03-20", done: false },
  { repRef: "r2", commitment: "Update stage notes", dueOn: "2026-03-01", done: null },
  { repRef: "R3", commitment: "Review a call with me", dueOn: "2026-12-01", done: null },
  { repRef: "R4", commitment: "", done: null },
], "2026-06-01");
eq(oo.total, 5, "one-on-ones: five meetings");
eq(oo.reps, 4, "one-on-ones: R1 twice, so four reps");
eq(oo.commitments, 4, "one-on-ones: four made a commitment");
eq(oo.doneOnTimePct, 50, "one-on-ones: one of two answered was done on time");
eq(oo.overdueOpen, 1, "one-on-ones: one open commitment is overdue");
eq(c.oneOnOneSummary([]).doneOnTimePct, null, "one-on-ones: nothing entered");
eq(c.ONE_ON_ONE_SEGMENTS.length, 5, "one-on-ones: five segments in 30 minutes");
eq(c.doneOnTimePct([true, true, true, false]), 75, "done on time: 3 of 4 is 75%");

const reps = c.bandReps([
  { repRef: "R1", tenureMonths: 8, output: 60 },
  { repRef: "R2", tenureMonths: 10, output: 100 },
  { repRef: "R3", tenureMonths: 6, output: 80 },
  { repRef: "R4", tenureMonths: 2, output: 30 },
  { repRef: "R5", tenureMonths: 24, output: 150 },
  { repRef: "R6", tenureMonths: 30, output: 200 },
  { repRef: "R7", tenureMonths: 36, output: 250 },
]);
const rep = (id: string) => reps.rows.find((r) => r.repRef === id)!;
eq(rep("R1").band, "Developing", "banding: 8 months is Developing");
eq(rep("R1").bandAvg, 80, "banding: developing average of 60, 100 and 80 is 80");
eq(rep("R1").pct, 75, "banding: R1 at 60 against 80 is 75%");
eq(rep("R1").focus, "diagnose", "banding: below 80 means diagnose");
eq(rep("R2").focus, "learn", "banding: 100 against 80 is 125%, above 120, so learn");
eq(rep("R3").focus, "stretch", "banding: 100% is in band");
eq(rep("R4").alone, true, "banding: a rep alone in a band has nothing to compare with");
eq(rep("R4").focus, null, "banding: no focus for a rep alone in a band");
eq(rep("R5").focus, "diagnose", "banding: established R5 at 150 against 200 is 75%");
eq([reps.diagnose, reps.stretch, reps.learn], [2, 2, 2], "banding: two of each focus");
eq(c.bandingFocus(100), "In band: stretch", "banding: focus label");
eq(c.bandingFor(null), { limits: { rampUpTo: 3, developingUpTo: 12 }, cut: { low: 80, high: 120 } }, "banding: defaults");
eq(c.bandingFor({ banding: { rampUpTo: 6, developingUpTo: 18, low: 70, high: 130 } }).limits.developingUpTo, 18, "banding: cohort override");
eq(c.bandingFor({ banding: { rampUpTo: 12, developingUpTo: 6 } }).limits.rampUpTo, 3, "banding: bad limits fall back to the defaults");
eq(c.bandReps([{ repRef: "A", tenureMonths: 8, output: 60 }, { repRef: "B", tenureMonths: 8, output: 100 }], { limits: { rampUpTo: 3, developingUpTo: 12 }, cut: { low: 70, high: 130 } }).rows[0].focus, "stretch", "banding: 75% is in band when the low cut-off is 70");
