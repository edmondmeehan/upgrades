"use client";
import { useState } from "react";
import { PRESETS, type Question } from "@/lib/questions";

const rid = () => Math.random().toString(36).slice(2, 8);

/** Package form section: questions fans answer at checkout. */
export function QuestionsEditor({ initial }: { initial: Question[] }) {
  const [qs, setQs] = useState<Question[]>(initial);
  const set = (i: number, patch: Partial<Question>) => setQs((cur) => cur.map((q, n) => (n === i ? { ...q, ...patch } : q)));
  const add = (q: Omit<Question, "id">) => setQs((cur) => (cur.length >= 6 ? cur : [...cur, { ...q, id: rid() }]));
  return (
    <section className="panel grid gap-4">
      <input type="hidden" name="questions" value={JSON.stringify(qs)} />
      <div>
        <h2>Checkout questions</h2>
        <p className="muted mt-1">Ask fans for what you need before they pay. Answers show on your orders, the check-in scanner and the order export.</p>
      </div>
      {qs.length === 0 && <p className="help">No questions yet. Most packages don&apos;t need any.</p>}
      <ul className="grid gap-3">
        {qs.map((q, i) => (
          <li key={q.id} className="grid gap-3 rounded-2xl bg-paper p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="field"><span className="!text-[12px]">Question</span><input value={q.label} maxLength={140} onChange={(e) => set(i, { label: e.target.value })} className="input input-sm" /></label>
              <label className="field"><span className="!text-[12px]">Answer type</span>
                <select value={q.type} onChange={(e) => set(i, { type: e.target.value as Question["type"], ...(e.target.value === "agree" ? { required: true, per: "order" as const } : {}) })} className="input input-sm">
                  <option value="text">Short answer</option><option value="select">Pick from a list</option><option value="agree">Checkbox to agree</option>
                </select></label>
            </div>
            {q.type === "select" && (
              <label className="field"><span className="!text-[12px]">Choices, separated by commas</span>
                <input value={(q.options ?? []).join(", ")} onChange={(e) => set(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} className="input input-sm" placeholder="S, M, L, XL" /></label>
            )}
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              {q.type !== "agree" && (
                <>
                  <label className="flex items-center gap-2"><input type="radio" className="check !size-4" checked={q.per === "order"} onChange={() => set(i, { per: "order" })} />Once per order</label>
                  <label className="flex items-center gap-2"><input type="radio" className="check !size-4" checked={q.per === "pass"} onChange={() => set(i, { per: "pass" })} />For each guest</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="check !size-4" checked={q.required} onChange={(e) => set(i, { required: e.target.checked })} />Required</label>
                </>
              )}
              <button type="button" onClick={() => setQs((cur) => cur.filter((_, n) => n !== i))} className="ml-auto font-bold text-rope underline">Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {qs.length < 6 && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => <button key={p.key} type="button" onClick={() => add(p.q)} className="btn btn-ghost btn-sm">+ {p.name}</button>)}
          <button type="button" onClick={() => add({ label: "", type: "text", required: false, per: "order" })} className="btn btn-ghost btn-sm">+ Your own question</button>
        </div>
      )}
    </section>
  );
}
