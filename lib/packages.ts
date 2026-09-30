export type PackageTemplate = {
  kind: string; name: string; description: string; included: string[]; includes_photo: boolean; price: number; capacity: number;
};

/** Starting points from the spec. Artists can change everything. */
export const TEMPLATES: PackageTemplate[] = [
  { kind: "meet_greet", name: "Meet & greet + photo", description: "Meet the artist before the show and get a professional photo together.",
    included: ["Meet & greet with the artist", "Professional photo, delivered after the show", "Commemorative laminate"], includes_photo: true, price: 150, capacity: 30 },
  { kind: "soundcheck", name: "Soundcheck experience", description: "Watch soundcheck from the floor before doors open.",
    included: ["Access to soundcheck", "Early entry to the venue", "Exclusive merch item", "Commemorative laminate"], includes_photo: false, price: 125, capacity: 40 },
  { kind: "early_entry", name: "Early entry", description: "Get in before general doors and pick your spot.",
    included: ["Entry before general doors", "Commemorative laminate"], includes_photo: false, price: 45, capacity: 100 },
  { kind: "merch_bundle", name: "Merch bundle", description: "A VIP-only merch pack waiting for you at the show.",
    included: ["Exclusive VIP merch item", "Signed poster", "Tote bag"], includes_photo: false, price: 75, capacity: 150 },
  { kind: "qa_acoustic", name: "Q&A and acoustic set", description: "An intimate pre-show Q&A and a short acoustic set.",
    included: ["Pre-show Q&A", "Private acoustic performance", "Commemorative laminate"], includes_photo: false, price: 175, capacity: 25 },
  { kind: "custom", name: "", description: "", included: [], includes_photo: false, price: 100, capacity: 30 },
];

export const KIND_LABEL: Record<string, string> = {
  meet_greet: "Meet & greet", soundcheck: "Soundcheck", early_entry: "Early entry", merch_bundle: "Merch bundle",
  qa_acoustic: "Q&A / acoustic", custom: "Custom",
};

export type Product = {
  id: string; artist_id: string; name: string; description: string | null; kind: string; includes_photo: boolean;
  included: string[]; image_url: string | null; archived_at: string | null; is_sample: boolean;
  default_price_cents: number | null; default_capacity: number | null;
};

export type ShowProduct = {
  id: string; artist_id: string; show_id: string; product_id: string; price_cents: number; capacity: number;
  on_sale_at: string | null; off_sale_at: string | null; presale_code: string | null; active: boolean; is_sample: boolean;
  uses_default_price: boolean; uses_default_capacity: boolean;
};

export const dollars = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

/** "$1,250.50" -> 125050. NaN when unreadable. */
export const parseCents = (v: string) => Math.round(Number(String(v).replace(/[$,\s]/g, "")) * 100);
