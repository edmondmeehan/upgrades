"use client";
import { useState } from "react";
import type { Question } from "@/lib/questions";

/** Quantity picker plus the package's checkout questions. Guest questions repeat for each pass. */
export function BuyFields({ maxQty, questions, presale }: { maxQty: number; questions: Question[]; presale: boolean }) {
  const [qty, setQty] = useState(1);
  const orderQs = questions.filter((q) => q.per === "order"), passQs = questions.filter((q) => q.per === "pass");
  const field = (q: Question, name: string, label?: string) => {
    if (q.type === "agree") return (
      <label key={name} className="flex items-start gap-2 text-[13px]"><input type="checkbox" name={name} required className="check mt-0.5 !size-4" /><span>{q.label}</span></label>
    );
    return (
      <label key={name} className="field"><span className="!text-[12px]">{label ?? q.label}{q.required ? "" : " (optional)"}</span>
        {q.type === "select"
          ? <select name={name} required={q.required} className="input input-sm" defaultValue=""><option value="" disabled>Choose…</option>{q.options?.map((o) => <option key={o}>{o}</option>)}</select>
          : <input name={name} required={q.required} maxLength={200} className="input input-sm" />}
      </label>
    );
  };
  return (
    <>
      <div className="flex gap-2">
        {maxQty > 1 ? (
          <label className="field w-24"><span className="!text-[12px]">Quantity</span>
            <select name="qty" className="input input-sm" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
              {Array.from({ length: maxQty }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        ) : <input type="hidden" name="qty" value="1" />}
        {presale && (
          <label className="field flex-1"><span className="!text-[12px]">Presale code</span>
            <input name="code" className="input input-sm uppercase" required autoComplete="off" /></label>
        )}
      </div>
      {orderQs.map((q) => field(q, `q_order_${q.id}`))}
      {passQs.length > 0 && Array.from({ length: qty }, (_, i) => (
        <fieldset key={i} className="grid gap-2 rounded-xl bg-paper p-3">
          {qty > 1 && <legend className="px-1 text-[12px] font-bold">Guest {i + 1}</legend>}
          {passQs.map((q) => field(q, `q_pass_${i}_${q.id}`))}
        </fieldset>
      ))}
    </>
  );
}
