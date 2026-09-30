export const COMMON_TZ = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Winnipeg", "America/Edmonton",
  "America/Vancouver", "America/Halifax", "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin",
  "Europe/Amsterdam", "Europe/Madrid", "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
];

export const tzLabel = (z: string) => z.replace(/_/g, " ").replace(/^America\//, "").replace(/^Pacific\//, "");

const E = "America/New_York", C = "America/Chicago", M = "America/Denver", P = "America/Los_Angeles";

// Best guess by state/province (for states split across zones, the zone of the largest music markets).
const REGION_TZ: Record<string, string> = {
  AL: C, AK: "America/Anchorage", AZ: "America/Phoenix", AR: C, CA: P, CO: M, CT: E, DE: E, DC: E, FL: E,
  GA: E, HI: "Pacific/Honolulu", ID: M, IL: C, IN: E, IA: C, KS: C, KY: E, LA: C, ME: E, MD: E, MA: E,
  MI: E, MN: C, MS: C, MO: C, MT: M, NE: C, NV: P, NH: E, NJ: E, NM: M, NY: E, NC: E, ND: C, OH: E,
  OK: C, OR: P, PA: E, RI: E, SC: E, SD: C, TN: C, TX: C, UT: M, VT: E, VA: E, WA: P, WV: E, WI: C, WY: M,
  PR: "America/Puerto_Rico",
  ON: "America/Toronto", QC: "America/Toronto", BC: "America/Vancouver", AB: "America/Edmonton",
  MB: "America/Winnipeg", SK: "America/Regina", NS: "America/Halifax", NB: "America/Halifax",
  NL: "America/St_Johns", PE: "America/Halifax",
};

const REGION_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", "washington dc": "DC", florida: "FL", georgia: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
  maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
  texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", ontario: "ON", quebec: "QC", "british columbia": "BC", alberta: "AB",
  manitoba: "MB", saskatchewan: "SK", "nova scotia": "NS", "new brunswick": "NB",
};

const CA_PROVINCES = new Set(["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE"]);

/** "tennessee" / "TN" / "Tn." -> "TN" when it's a US state or Canadian province; otherwise the trimmed input. */
export function normalizeRegion(r: string) {
  const t = r.trim().replace(/\.$/, "");
  const up = t.toUpperCase();
  if (REGION_TZ[up]) return up;
  return REGION_NAMES[t.toLowerCase()] ?? t;
}

export function tzForRegion(region: string, country = "US"): string | null {
  const code = normalizeRegion(region).toUpperCase();
  if ((country === "US" || country === "CA") && REGION_TZ[code]) return REGION_TZ[code];
  return null;
}

export function countryForRegion(region: string): "US" | "CA" | null {
  const code = normalizeRegion(region).toUpperCase();
  if (CA_PROVINCES.has(code)) return "CA";
  if (REGION_TZ[code]) return "US";
  return null;
}

export function isValidTimeZone(z: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; }
}
