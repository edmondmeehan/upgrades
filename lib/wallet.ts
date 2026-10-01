import { PKPass } from "passkit-generator";
import { WALLET_IMAGES } from "@/lib/walletImages";
import { qrPayload } from "@/lib/qr";
import { fullAddress, hasCheckinDetails, checkinNotes, type CheckinShow } from "@/lib/checkinEmail";
import { formatTime } from "@/lib/util";

/** PEM from an env var: accepts the PEM itself (with real or "\n" newlines) or base64 of it. */
function pem(v: string | undefined) {
  if (!v) return null;
  const t = v.trim();
  if (t.includes("-----BEGIN")) return t.replace(/\\n/g, "\n");
  try { const d = Buffer.from(t, "base64").toString("utf8"); return d.includes("-----BEGIN") ? d : null; } catch { return null; }
}

/** Apple Wallet is on once P&T's Pass Type ID certificate is in Vercel. */
export function walletEnabled() {
  return !!(process.env.APPLE_WALLET_PASS_TYPE_ID && process.env.APPLE_WALLET_TEAM_ID && pem(process.env.APPLE_WALLET_SIGNER_CERT) && pem(process.env.APPLE_WALLET_SIGNER_KEY) && pem(process.env.APPLE_WALLET_WWDR));
}

const rgb = (hex: string | null | undefined, fallback: string) => {
  const h = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? hex! : fallback;
  return `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
};

export type WalletPassInput = {
  code: string; guestLabel: string; confirmation: string; packageName: string; pkgCheckinTime: string | null; pkgNotes: string | null;
  artist: { name: string; brand_color?: string | null; accent_color?: string | null; support_email?: string | null };
  show: CheckinShow & { slug?: string };
  orderUrl: string;
};

/** Treats a wall-clock date/time as being in the show's time zone and returns the real instant. */
function zoned(local: Date, tz: string) {
  const asUtc = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()));
  const inTz = new Date(asUtc.toLocaleString("en-US", { timeZone: tz }));
  const inUtc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() + (inUtc.getTime() - inTz.getTime()));
}

/** Builds a signed .pkpass for one VIP pass (event ticket style, QR code, check-in details on the back). */
export function buildWalletPass(x: WalletPassInput): Buffer {
  const wwdr = pem(process.env.APPLE_WALLET_WWDR)!, signerCert = pem(process.env.APPLE_WALLET_SIGNER_CERT)!, signerKey = pem(process.env.APPLE_WALLET_SIGNER_KEY)!;
  const checkin = x.pkgCheckinTime ?? x.show.checkin_time;
  const tz = x.show.timezone || "America/New_York";
  // Wallet shows the pass on the lock screen around show time.
  const [hh, mm] = (checkin ?? x.show.doors_time ?? "18:00").split(":").map(Number);
  const [y, mo, d] = x.show.show_date.split("-").map(Number);
  const relevant = new Date(y, mo - 1, d, hh || 18, mm || 0);
  const date = new Date(`${x.show.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const where = `${x.show.city ?? ""}${x.show.region ? `, ${x.show.region}` : ""}`;

  const files: Record<string, Buffer> = {};
  for (const [k, v] of Object.entries(WALLET_IMAGES)) files[k] = Buffer.from(v, "base64");
  files["pass.json"] = Buffer.from(JSON.stringify({
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_WALLET_PASS_TYPE_ID,
    teamIdentifier: process.env.APPLE_WALLET_TEAM_ID,
    organizationName: x.artist.name,
    description: `${x.artist.name} VIP pass`,
    serialNumber: x.code,
    logoText: x.artist.name,
    backgroundColor: rgb(x.artist.brand_color, "#130056"),
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: rgb(x.artist.accent_color, "#F2D64B"),
    eventTicket: {},
  }));
  const pass = new PKPass(files, { wwdr, signerCert, signerKey, signerKeyPassphrase: process.env.APPLE_WALLET_KEY_PASSPHRASE || undefined });
  pass.primaryFields.push({ key: "package", label: "VIP", value: x.packageName });
  pass.secondaryFields.push({ key: "date", label: "Date", value: date }, { key: "city", label: "City", value: where });
  pass.auxiliaryFields.push(
    ...(checkin ? [{ key: "checkin", label: "Check-in", value: formatTime(checkin)! }] : x.show.doors_time ? [{ key: "doors", label: "Doors", value: formatTime(x.show.doors_time)! }] : []),
    { key: "guest", label: "Guest", value: x.guestLabel },
  );
  pass.backFields.push(
    { key: "venue", label: "Venue", value: [x.show.venue_name, fullAddress(x.show)].filter(Boolean).join(", ") || "TBA" },
    ...(x.show.checkin_location ? [{ key: "where", label: "Where to check in", value: x.show.checkin_location }] : []),
    ...(x.show.checkin_contact_name || x.show.checkin_contact_phone ? [{ key: "contact", label: "Day-of contact", value: [x.show.checkin_contact_name, x.show.checkin_contact_phone].filter(Boolean).join(", ") }] : []),
    ...(hasCheckinDetails(x.show) ? checkinNotes(x.show, [{ name: x.packageName, qty: 1, time: x.pkgCheckinTime, notes: x.pkgNotes }]).map((n, i) => ({ key: `note${i}`, label: i ? "" : "Know before you go", value: n })) : []),
    { key: "conf", label: "Confirmation number", value: x.confirmation },
    { key: "code", label: "Pass code", value: x.code },
    { key: "order", label: "Your order", value: x.orderUrl },
    { key: "ticket", label: "Note", value: "This is a VIP upgrade. Your concert ticket is separate." },
    ...(x.artist.support_email ? [{ key: "support", label: "Questions", value: x.artist.support_email }] : []),
  );
  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: qrPayload(x.code), messageEncoding: "iso-8859-1", altText: x.code });
  if (!Number.isNaN(relevant.getTime())) pass.setRelevantDate(zoned(relevant, tz));
  return pass.getAsBuffer();
}
