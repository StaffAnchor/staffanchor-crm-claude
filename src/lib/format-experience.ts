// total_experience_years is stored as a decimal (e.g. 6.166666666666667,
// derived from summing months across employers and dividing by 12). Showing
// that raw decimal to a recruiter looks broken ("6.166666666666667 yrs") and
// even a clean-looking one like "3.25 yrs" isn't how anyone actually talks
// about experience. This converts it to the natural "X yrs Y mo" phrasing
// recruiters actually use, rounding to the nearest month so the seams from
// the underlying months/12 math never show.
export function formatExperience(years: number | null | undefined): string {
  if (years == null || Number.isNaN(years)) return "—";

  const totalMonths = Math.round(years * 12);
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;

  if (y === 0 && m === 0) return "0 mo";
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} ${y === 1 ? "yr" : "yrs"}`;
  return `${y} ${y === 1 ? "yr" : "yrs"} ${m} mo`;
}
