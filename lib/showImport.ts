import { countryForRegion, normalizeRegion, tzForRegion } from "./timezones";

export type DraftShow = {
  key: string;
  show_date: string;      // YYYY-MM-DD, or "" if unreadable
  raw_date?: string;      // what we couldn't read
  city: string;
  region: string;
  venue_name: string;
  country: string;
  doors_time: string;     // HH:MM or ""
  show_time: string;      // HH:MM or ""
  timezone: string;
  tzAuto: boolean;        // timezone was guessed from the state; follow region edits
  address: string;
  postal_code: string;
};

let n = 0;
export const newKey = () => `r${Date.now().toString(36)}${(n++).toString(36)}`;

export function blankShow(defaults: Partial<DraftShow> = {}): DraftShow {
  return {
    key: newKey(), show_date: "", city: "", region: "", venue_name: "", country: "US",
    doors_time: "", show_time: "", timezone: "America/New_York", tzAuto: true, address: "", postal_code: "",
    ...defaults,
  };
}

/** Recompute country/timezone after the region changes (only when the timezone is still a guess). */
export function withRegion(row: DraftShow, region: string): DraftShow {
  const next = { ...row, region };
  const guessedCountry = countryForRegion(region);
  if (guessedCountry && (row.country === "US" || row.country === "CA" || !row.country)) next.country = guessedCountry;
  if (row.tzAuto) {
    const tz = tzForRegion(region, next.country);
    if (tz) next.timezone = tz;
  }
  return next;
}

// ── Delimited text ───────────────────────────────────────────
function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  if (tabs >= 1 && tabs >= commas) return "\t";
  if (semis > commas) return ";";
  return ",";
}

export function parseDelimited(text: string): string[][] {
  const d = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") { q = true; cell = ""; }
    else if (c === d) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

// ── Dates & times ────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (x: number) => String(x).padStart(2, "0");

function valid(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Picks a year for dates written without one: this year, or next year if that date is well in the past. */
function inferYear(m: number, d: number, today = new Date()) {
  const y = today.getFullYear();
  const candidate = Date.UTC(y, m - 1, d);
  const cutoff = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - 60 * 86400000;
  return candidate < cutoff ? y + 1 : y;
}

export function parseDate(input: string, today = new Date()): string | null {
  const s = input.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null; }
  r = s.match(/^(?:[a-z]+ )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (r) {
    m = +r[1]; d = +r[2];
    y = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : inferYear(m, d, today);
    return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  const words = s.split(" ").filter((w) => !/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*$/.test(w) || MONTHS[w.slice(0, 3)] !== undefined && w.length > 3);
  const mi = words.findIndex((w) => MONTHS[w.slice(0, 4)] !== undefined || MONTHS[w.slice(0, 3)] !== undefined);
  if (mi >= 0) {
    const w = words[mi];
    m = MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)];
    const nums = words.filter((x, i) => i !== mi && /^\d+$/.test(x)).map(Number);
    const dayNum = nums.find((x) => x >= 1 && x <= 31 && String(x).length <= 2);
    const yearNum = nums.find((x) => x >= 1000) ?? nums.filter((x) => x !== dayNum).find((x) => x >= 0 && x <= 99);
    if (dayNum === undefined) return null;
    d = dayNum;
    y = yearNum === undefined ? inferYear(m, d, today) : yearNum < 100 ? 2000 + yearNum : yearNum;
    return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  return null;
}

export function parseTime(input: string): string {
  const s = input.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  if (!s) return "";
  const r = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!r) return "";
  let h = +r[1];
  const min = r[2] ? +r[2] : 0;
  const ap = r[3];
  if (ap?.startsWith("p") && h < 12) h += 12;
  if (ap?.startsWith("a") && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 11 && !r[2]) h += 12; // "7" on a show sheet means 7pm
  if (h > 23 || min > 59) return "";
  return `${pad(h)}:${pad(min)}`;
}

// ── Header mapping ───────────────────────────────────────────
type Field = "date" | "city" | "region" | "venue" | "country" | "doors" | "show" | "timezone" | "address" | "postal";
const ALIASES: Record<Field, string[]> = {
  date: ["date", "show date", "day", "event date"],
  city: ["city", "town", "market", "city/state", "city, state", "location city"],
  region: ["state", "st", "region", "province", "prov", "state/province"],
  venue: ["venue", "venue name", "location", "building", "room"],
  country: ["country", "ctry"],
  doors: ["doors", "door", "door time", "doors time", "doors open"],
  show: ["show", "show time", "start", "start time", "set time", "showtime", "time"],
  timezone: ["timezone", "time zone", "tz"],
  address: ["address", "street", "venue address", "street address"],
  postal: ["zip", "zip code", "postal", "postal code", "postcode"],
};

function mapHeader(cells: string[]): Partial<Record<Field, number>> | null {
  const map: Partial<Record<Field, number>> = {};
  cells.forEach((c, i) => {
    const k = c.toLowerCase().replace(/[_*]/g, " ").replace(/\s+/g, " ").trim();
    for (const f of Object.keys(ALIASES) as Field[]) {
      if (map[f] === undefined && ALIASES[f].includes(k)) { map[f] = i; break; }
    }
  });
  return map.date !== undefined && Object.keys(map).length >= 2 ? map : null;
}

export type ImportResult = { rows: DraftShow[]; headerFound: boolean; unreadable: number };

/**
 * Turns pasted spreadsheet rows or CSV text into draft shows.
 * With a header row, columns are matched by name. Without one, columns are read as
 * date, city, state, venue (the usual order on a routing sheet).
 */
export function rowsFromText(text: string, defaults: Partial<DraftShow> = {}, today = new Date()): ImportResult {
  const table = parseDelimited(text);
  if (table.length === 0) return { rows: [], headerFound: false, unreadable: 0 };
  let map = mapHeader(table[0]);
  const headerFound = !!map;
  const body = headerFound ? table.slice(1) : table;
  if (!map) map = { date: 0, city: 1, region: 2, venue: 3 };
  const get = (r: string[], f: Field) => (map![f] === undefined ? "" : r[map![f]!] ?? "");

  let unreadable = 0;
  const rows = body.map((r) => {
    const rawDate = get(r, "date");
    const date = parseDate(rawDate, today);
    if (!date) unreadable++;
    let city = get(r, "city");
    let region = get(r, "region");
    let venue = get(r, "venue");
    const combo = city.match(/^(.*?),\s*([A-Za-z .]{2,})$/);
    if (combo && (!region || (!headerFound && countryForRegion(combo[2])))) {
      // "Chicago, IL" in one cell. On a headerless sheet the columns after it shift left.
      if (region && !headerFound && !venue) venue = region;
      city = combo[1]; region = combo[2];
    }
    region = region ? normalizeRegion(region) : "";
    const country = (get(r, "country") || countryForRegion(region) || defaults.country || "US").toUpperCase().slice(0, 2);
    const tzCell = get(r, "timezone");
    const guessed = tzForRegion(region, country);
    let row = blankShow({
      ...defaults,
      show_date: date ?? "",
      raw_date: date ? undefined : rawDate,
      city: city.trim(),
      venue_name: venue.trim(),
      country,
      doors_time: parseTime(get(r, "doors")) || defaults.doors_time || "",
      show_time: parseTime(get(r, "show")) || defaults.show_time || "",
      address: get(r, "address"),
      postal_code: get(r, "postal"),
    });
    row.region = region;
    if (tzCell) { row.timezone = tzCell; row.tzAuto = false; }
    else if (guessed) { row.timezone = guessed; row.tzAuto = true; }
    return row;
  });
  return { rows, headerFound, unreadable };
}
