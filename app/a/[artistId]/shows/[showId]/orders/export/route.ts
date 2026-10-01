import { requireArtist } from "@/lib/auth";
import { sanitizeQuestions, type Question } from "@/lib/questions";

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
type Row = {
  confirmation_code: string; status: string; is_comp: boolean; answers: Record<string, string> | null; fans: { name: string | null; email: string } | null;
  order_items: { show_products: { products: { name: string; questions: unknown } } | null;
    passes: { code: string; attendee_name: string | null; attendee_email: string | null; checked_in_at: string | null; voided_at: string | null; answers: Record<string, string> | null }[] }[];
};

/** One row per pass: buyer, guest, package, answers, check-in. For the venue, merch table or door list. */
export async function GET(_req: Request, { params }: { params: Promise<{ artistId: string; showId: string }> }) {
  const { artistId, showId } = await params;
  const { supabase } = await requireArtist(artistId, ["owner", "rep"]);
  const [{ data: show }, { data }] = await Promise.all([
    supabase.from("shows").select("show_date, city").eq("id", showId).eq("artist_id", artistId).single(),
    supabase.from("orders").select("confirmation_code, status, is_comp, answers, fans(name, email), order_items(show_products(products(name, questions)), passes(code, attendee_name, attendee_email, checked_in_at, voided_at, answers))")
      .eq("show_id", showId).eq("is_sample", false).order("created_at").returns<Row[]>(),
  ]);
  const qMap = new Map<string, Question>();
  (data ?? []).forEach((o) => o.order_items.forEach((i) => sanitizeQuestions(i.show_products?.products.questions).forEach((q) => qMap.set(q.id, q))));
  const qs = [...qMap.values()];
  const head = ["Confirmation", "Buyer", "Buyer email", "Package", "Pass code", "Guest name", "Guest email", "Status", "Checked in", ...qs.map((q) => q.label)];
  const lines: string[] = [];
  for (const o of data ?? []) for (const i of o.order_items) for (const p of i.passes) {
    lines.push([o.confirmation_code, o.fans?.name, o.fans?.email, i.show_products?.products.name, p.code, p.attendee_name, p.attendee_email,
      p.voided_at ? "Void" : o.is_comp ? "Comp" : o.status, p.checked_in_at ? new Date(p.checked_in_at).toLocaleString("en-US") : "",
      ...qs.map((q) => (q.per === "pass" ? p.answers?.[q.id] : o.answers?.[q.id]) ?? "")].map(cell).join(","));
  }
  const name = `${show?.show_date ?? "show"}-${(show?.city ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-passes.csv`;
  return new Response([head.map(cell).join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
