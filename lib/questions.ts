/** Checkout questions artists add to a package. Answers are keyed by question id. */
export type Question = {
  id: string; label: string; type: "text" | "select" | "agree"; options?: string[]; required: boolean; per: "order" | "pass";
};
export type Answers = { order: Record<string, string>; passes: Record<string, string>[] };

export const PRESETS: { key: string; name: string; q: Omit<Question, "id"> }[] = [
  { key: "age", name: "Age confirmation", q: { label: "I confirm every guest on this order will be 18 or older", type: "agree", required: true, per: "order" } },
  { key: "size", name: "T-shirt size", q: { label: "T-shirt size", type: "select", options: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], required: true, per: "pass" } },
  { key: "ticket", name: "Concert ticket order number", q: { label: "Your concert ticket order number", type: "text", required: false, per: "order" } },
  { key: "name", name: "Guest name", q: { label: "Guest's full name", type: "text", required: true, per: "pass" } },
];

const rid = () => Math.random().toString(36).slice(2, 8);

/** Cleans questions coming from the package form. */
export function sanitizeQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).map((q) => {
    const x = q as Partial<Question>;
    const type = x.type === "select" || x.type === "agree" ? x.type : "text";
    const options = type === "select" ? (x.options ?? []).map((o) => String(o).trim().slice(0, 40)).filter(Boolean).slice(0, 20) : undefined;
    return {
      id: /^[a-z0-9]{3,12}$/.test(String(x.id ?? "")) ? String(x.id) : rid(),
      label: String(x.label ?? "").trim().slice(0, 140), type, ...(options ? { options } : {}),
      required: type === "agree" ? true : !!x.required, per: x.per === "pass" && type !== "agree" ? "pass" : "order",
    } as Question;
  }).filter((q) => q.label && (q.type !== "select" || (q.options?.length ?? 0) > 0));
}

/** Reads and checks a fan's answers from the buy form. Field names: q_order_<id>, q_pass_<n>_<id>. */
export function readAnswers(questions: Question[], qty: number, fd: FormData): { answers: Answers | null; error?: string } {
  if (!questions.length) return { answers: null };
  const answers: Answers = { order: {}, passes: Array.from({ length: qty }, () => ({})) };
  const check = (q: Question, raw: FormDataEntryValue | null, guest?: number) => {
    let v = String(raw ?? "").trim().slice(0, 200);
    if (q.type === "agree") v = raw === "on" ? "Yes" : "";
    if (q.type === "select" && v && !q.options?.includes(v)) v = "";
    if (q.required && !v) return q.type === "agree" ? `Please tick "${q.label}".` : `Please answer "${q.label}"${guest !== undefined && qty > 1 ? ` for guest ${guest + 1}` : ""}.`;
    return v;
  };
  for (const q of questions) {
    if (q.per === "order") { const v = check(q, fd.get(`q_order_${q.id}`)); if (v.startsWith("Please")) return { answers: null, error: v }; if (v) answers.order[q.id] = v; }
    else for (let i = 0; i < qty; i++) { const v = check(q, fd.get(`q_pass_${i}_${q.id}`), i); if (v.startsWith("Please")) return { answers: null, error: v }; if (v) answers.passes[i][q.id] = v; }
  }
  return { answers };
}

/** "T-shirt size: M, Ticket order: 123" for display. */
export function describeAnswers(questions: Question[], a: Record<string, string> | null | undefined) {
  if (!a) return "";
  return questions.filter((q) => a[q.id]).map((q) => `${q.type === "agree" ? "Agreed" : q.label}${q.type === "agree" ? "" : `: ${a[q.id]}`}`).join(", ");
}
