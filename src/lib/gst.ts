// GSTIN helpers that work offline: format + checksum validation, and the
// state / PAN a GSTIN already carries. Name and address are NOT in the
// number -- those need a GST data provider (not wired up).

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "28": "Andhra Pradesh (old)",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh",
  "38": "Ladakh", "97": "Other Territory", "99": "Centre Jurisdiction",
};

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const FORMAT = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinInfo =
  | { ok: true; gstin: string; stateCode: string; stateName: string; pan: string }
  | { ok: false; error: string };

export function parseGstin(raw: string): GstinInfo {
  const gstin = raw.replace(/\s+/g, "").toUpperCase();
  if (gstin.length !== 15) return { ok: false, error: "A GSTIN has 15 characters." };
  if (!FORMAT.test(gstin)) return { ok: false, error: "This doesn't look like a GSTIN (check the letters and digits)." };
  const stateCode = gstin.slice(0, 2);
  const stateName = GST_STATES[stateCode];
  if (!stateName) return { ok: false, error: `Unknown state code ${stateCode}.` };
  if (checkChar(gstin.slice(0, 14)) !== gstin[14]) return { ok: false, error: "Checksum doesn't match, so a character is probably mistyped." };
  return { ok: true, gstin, stateCode, stateName, pan: gstin.slice(2, 12) };
}
