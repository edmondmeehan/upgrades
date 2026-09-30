export type PromoTerms = { fee_bps: number; months: number | null; show_limit: number | null };

/** "5% service fee for 3 months", "No service fee for 10 show dates". */
export function promoSummary(c: PromoTerms) {
  const fee = c.fee_bps === 0 ? "No service fee" : `${c.fee_bps / 100}% service fee`;
  const len = [c.months ? `${c.months} month${c.months === 1 ? "" : "s"}` : null, c.show_limit ? `${c.show_limit} show date${c.show_limit === 1 ? "" : "s"}` : null].filter(Boolean).join(" or ");
  return `${fee} for ${len}${c.months && c.show_limit ? ", whichever ends first" : ""}`;
}
