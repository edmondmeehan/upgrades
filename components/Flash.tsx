export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return <div role={err ? "alert" : "status"} className={`alert ${err ? "alert-red" : "alert-green"}`}>{err ?? ok}</div>;
}

export type Msg = Promise<{ ok?: string; err?: string }>;
