// Which metro a free-text location belongs to. "Delhi NCR" is the whole region, so Delhi, New Delhi, Noida, Gurgaon,
// Faridabad, Ghaziabad and the towns around them all count as the same place for a role in Delhi NCR.

const NCR = ["delhi", "new delhi", "ncr", "noida", "greater noida", "gurgaon", "gurugram", "faridabad", "ghaziabad", "dwarka", "rohini", "janakpuri", "saket", "vasant", "okhla", "kapashera", "manesar", "sonipat", "bahadurgarh", "sahibabad", "indirapuram", "vaishali", "kaushambi", "noida extension", "greater faridabad", "palwal", "bhiwadi"];
const MMR = ["mumbai", "navi mumbai", "thane", "kalyan", "dombivli", "dombivali", "vasai", "virar", "panvel", "mira road", "bhayandar", "mulund", "borivali", "andheri", "powai", "vashi", "belapur", "kharghar", "ulhasnagar", "bombay"];
const PUNE = ["pune", "pimpri", "chinchwad", "hinjewadi", "hinjawadi", "kharadi", "wakad", "baner", "hadapsar"];
const BLR = ["bengaluru", "bangalore", "whitefield", "electronic city", "marathahalli"];
const HYD = ["hyderabad", "secunderabad", "gachibowli", "hitec city", "madhapur"];
const MAA = ["chennai", "madras"];
const CCU = ["kolkata", "calcutta", "howrah", "salt lake"];
const AMD = ["ahmedabad", "gandhinagar"];

const REGIONS: [string, string[]][] = [
  ["Delhi NCR", NCR],
  ["Mumbai (MMR)", MMR],
  ["Pune", PUNE],
  ["Bengaluru", BLR],
  ["Hyderabad", HYD],
  ["Chennai", MAA],
  ["Kolkata", CCU],
  ["Ahmedabad", AMD],
];

/** The metro a location text points to, or null when it names none of the known ones. "Navi Mumbai" is Mumbai (MMR), "New Delhi" is Delhi NCR. */
export function metroOfLocation(text: string | null | undefined): string | null {
  const t = ` ${(text ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (t.trim() === "") return null;
  for (const [metro, words] of REGIONS) {
    if (words.some((w) => t.includes(` ${w} `) || t.includes(` ${w}s `))) return metro;
  }
  return null;
}
