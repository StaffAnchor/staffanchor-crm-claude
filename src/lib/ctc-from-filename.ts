// Reads a current CTC out of a resume's file name, so a recruiter can save a
// download as "Priya_Sharma_12L.pdf" (or "..._12.5LPA", "..._1.2Cr") and the
// bulk upload fills Current CTC without opening anything.
//
// Only an explicit unit counts (L, LPA, Lac(s), Lakh(s), Cr, Crore): a bare
// number in a file name is far more often a version or a year than a salary.
// Returns lakhs per annum, or null when no CTC is in the name. If a name has
// two amounts, the first is taken.
const PATTERN = /(?:^|[\s_\-.(\[])(\d{1,3}(?:\.\d{1,2})?)\s*(l|lpa|lac|lacs|lakh|lakhs|cr|crs|crore|crores)(?=$|[\s_\-.)\]])/i;

export function ctcFromFileName(fileName: string): number | null {
  const base = fileName.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  const m = PATTERN.exec(base);
  if (!m) return null;
  const amount = Number(m[1]);
  const unit = m[2].toLowerCase();
  const lakhs = unit.startsWith("cr") ? amount * 100 : amount;
  // Sanity band: 1 lakh to 5 crore a year.
  if (!Number.isFinite(lakhs) || lakhs < 1 || lakhs > 500) return null;
  return Math.round(lakhs * 100) / 100;
}
