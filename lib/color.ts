export const DEFAULT_BRAND = "#130056"; // navy
export const DEFAULT_ACCENT = "#f2d64b"; // yellow

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Black or white, whichever reads better on the given background. */
export const textOn = (bg: string) => (contrast(bg, "#0b0b0f") >= contrast(bg, "#ffffff") ? "#0b0b0f" : "#ffffff");

/** Keeps the accent readable on the brand color; falls back to the brand's text color if not. */
export function safeAccent(brand: string, accent: string) {
  return contrast(brand, accent) >= 3 ? accent : textOn(brand);
}

export const PALETTES: { name: string; brand: string; accent: string }[] = [
  { name: "OnTour", brand: "#130056", accent: "#f2d64b" },
  { name: "Midnight", brand: "#0b0b0f", accent: "#ff5a36" },
  { name: "Forest", brand: "#12372a", accent: "#e9c46a" },
  { name: "Ocean", brand: "#0b3954", accent: "#7fdbff" },
  { name: "Wine", brand: "#4a0e2e", accent: "#f7c1d9" },
  { name: "Desert", brand: "#7a3e1d", accent: "#fde2b8" },
  { name: "Chalk", brand: "#f5f1e8", accent: "#c8391a" },
  { name: "Electric", brand: "#2a0a6b", accent: "#3cf2a0" },
];
