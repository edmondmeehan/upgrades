import { JOBS } from "@/lib/health";

type Run = { job: string; last_ok_at: string | null; last_error_at: string | null; last_error: string | null };
const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
};

/** P&T admin: is everything running? Shows each background job's last success and any recent failure. */
export function SystemHealth({ runs }: { runs: Run[] }) {
  const byJob = new Map(runs.map((r) => [r.job, r]));
  const rows = Object.entries(JOBS).map(([job, label]) => {
    const r = byJob.get(job);
    const failing = !!r?.last_error_at && (!r.last_ok_at || new Date(r.last_error_at) > new Date(r.last_ok_at));
    return { job, label, r, failing };
  });
  const bad = rows.filter((x) => x.failing).length;
  return (
    <details className="card" open={bad > 0}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
        <span className="font-extrabold">System health</span>
        <span className={`badge ${bad ? "b-rejected" : "b-approved"}`}>{bad ? `${bad} problem${bad === 1 ? "" : "s"}` : "All good"}</span>
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map(({ job, label, r, failing }) => (
          <li key={job} className="grid gap-1 px-5 py-3 text-[14px] sm:grid-cols-[200px_minmax(0,1fr)]">
            <span className="font-semibold">{label}</span>
            <span>
              {failing
                ? <><span className="font-bold text-rope">Failing</span> since {ago(r!.last_error_at!)}: <span className="text-mute">{r!.last_error}</span></>
                : r?.last_ok_at ? <span className="text-ok">Worked {ago(r.last_ok_at)}</span> : <span className="text-mute">Hasn&apos;t run yet</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="help border-t border-line px-5 py-3">Admins are emailed when something fails (at most once an hour per job).</p>
    </details>
  );
}
