// A mandate states what kind of job it is (role type) and at what level. Both are required to open a role, and the
// matching reads them from the mandate: nothing is guessed. These helpers only offer a SUGGESTION from the title, and
// a person must press it.

export const LEVEL_OPTIONS = [
  { value: "ic", label: "Individual contributor (sells or works on their own)" },
  { value: "team_lead", label: "Team lead" },
  { value: "manager", label: "Manager (leads a team)" },
  { value: "director", label: "Director / Head" },
  { value: "vp_plus", label: "VP / CXO" },
] as const;

export type MandateLevel = (typeof LEVEL_OPTIONS)[number]["value"];
export const LEVEL_VALUES = LEVEL_OPTIONS.map((l) => l.value) as readonly string[];
export const levelLabel = (v: string | null | undefined) => LEVEL_OPTIONS.find((l) => l.value === v)?.label.split(" (")[0] ?? "Not set";

/** A hint from the title only. Never applied without a person choosing it. */
export function suggestFromTitle(title: string | null | undefined): { level: MandateLevel | null; cluster: string | null } {
  const t = (title ?? "").toLowerCase();
  let level: MandateLevel | null = null;
  if (/(vice president|\bvp\b|\bchief\b|\bcro\b|\bceo\b|\bcxo\b|president)/.test(t)) level = "vp_plus";
  else if (/(director|\bhead\b|general manager|\bgm\b)/.test(t)) level = "director";
  else if (/(manager|regional|national|zonal|cluster|country)/.test(t)) level = "manager";
  else if (/(team lead|team leader|\blead\b|supervisor)/.test(t)) level = "team_lead";
  else if (/(executive|associate|representative|\bsdr\b|\bbdr\b|\badr\b|\bae\b|specialist|consultant|trainee)/.test(t)) level = "ic";

  let cluster: string | null = null;
  if (/(\bsdr\b|\bbdr\b|\badr\b|sales development)/.test(t)) cluster = "sdr_bdr";
  else if (/(solution|pre-?sales|sales engineer)/.test(t)) cluster = "solution_eng";
  else if (/customer success/.test(t)) cluster = "customer_success";
  else if (/(key account|account manager)/.test(t)) cluster = "account_mgmt";
  else if (/(head|director|vp|vice president|chief|cro)\b.*(sales|business|revenue)|sales (head|director)|\bcro\b/.test(t)) cluster = "sales_leadership";
  else if (/(regional|national|zonal|area|cluster|senior|sr\.?|assistant|asst\.?|team lead|general)\b.*(sales|business|revenue)|sales (manager|lead|team lead)/.test(t)) cluster = "sales_manager";
  else if (/(account executive|\bae\b|sales executive)/.test(t)) cluster = "account_exec";
  else if (/inside sales/.test(t)) cluster = "inside_sales";
  else if (/business development/.test(t)) cluster = "bd_exec";
  return { level, cluster };
}
