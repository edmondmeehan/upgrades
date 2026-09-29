export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div role={err ? "alert" : "status"}
      className={`mb-6 rounded-xl border-2 px-4 py-3 font-semibold ${err ? "border-rope bg-[#fbeaec] text-rope" : "border-stage bg-yellow text-stage"}`}>
      {err ?? ok}
    </div>
  );
}

export type Msg = Promise<{ ok?: string; err?: string }>;
