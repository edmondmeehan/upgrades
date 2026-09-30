"use client";

import { useMemo, useRef, useState } from "react";
import { SubmitButton } from "./SubmitButton";
import { blankShow, rowsFromText, withRegion, type DraftShow } from "@/lib/showImport";
import { COMMON_TZ, tzLabel } from "@/lib/timezones";

type Props = {
  action: (fd: FormData) => void | Promise<void>;
  existingDates: string[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const addDays = (s: string, n: number) => { const d = fromIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const prettyDate = (s: string) =>
  fromIso(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const TEMPLATE = "Date,City,State,Venue,Doors,Show\n10/3/2026,Nashville,TN,Ryman Auditorium,6:30 PM,8:00 PM\n";

export function ShowBuilder({ action, existingDates }: Props) {
  const existing = useMemo(() => new Set(existingDates), [existingDates]);
  const [mode, setMode] = useState<"calendar" | "paste">("calendar");
  const [rows, setRows] = useState<DraftShow[]>([]);
  const [defaults, setDefaults] = useState({ doors_time: "", show_time: "", timezone: "America/New_York", country: "US" });
  const [notice, setNotice] = useState<string | null>(null);

  const addRows = (incoming: DraftShow[]) => {
    setRows((prev) => [...prev, ...incoming].sort((a, b) => (a.show_date || "9999").localeCompare(b.show_date || "9999")));
  };
  const update = (key: string, patch: Partial<DraftShow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateRegion = (key: string, region: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? withRegion(r, region) : r)));
  const remove = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const newRowDefaults = () => ({
    doors_time: defaults.doors_time, show_time: defaults.show_time, timezone: defaults.timezone,
    country: defaults.country, tzAuto: true,
  });

  const missingDate = rows.filter((r) => !r.show_date).length;
  const listDates = new Set(rows.map((r) => r.show_date).filter(Boolean));

  return (
    <section className="panel grid gap-6" aria-labelledby="add-shows">
      <div>
        <h3 id="add-shows" className="text-2xl">Add shows</h3>
        <p className="muted mt-1">Get dates into the list below, check them, then save. Shows save as drafts, so city and venue can be filled in later.</p>
      </div>

      <div role="tablist" aria-label="How to add shows" className="flex flex-wrap gap-2">
        {([["calendar", "Pick dates on a calendar"], ["paste", "Paste or upload a list"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setNotice(null); }}
            className={`btn ${mode === k ? "btn-dark" : "btn-ghost"}`}>{label}</button>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => addRows([blankShow(newRowDefaults())])}>Add one show</button>
      </div>

      {mode === "calendar"
        ? <CalendarPicker existing={existing} inList={listDates}
            onAdd={(dates) => { addRows(dates.map((d) => blankShow({ ...newRowDefaults(), show_date: d }))); setNotice(`Added ${dates.length} date${dates.length === 1 ? "" : "s"} to the list.`); }} />
        : <PasteImport defaults={newRowDefaults()}
            onAdd={(r, msg) => { addRows(r); setNotice(msg); }} />}

      {notice && <p role="status" className="rounded-lg bg-yellow px-3 py-2 font-semibold">{notice}</p>}

      {rows.length > 0 && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border-[1.5px] border-line bg-paper p-3">
            <p className="w-full font-semibold">Same for every show</p>
            <label className="field"><span className="!font-normal text-sm">Doors</span>
              <input className="input !min-h-10 w-32" type="time" value={defaults.doors_time} onChange={(e) => setDefaults({ ...defaults, doors_time: e.target.value })} /></label>
            <label className="field"><span className="!font-normal text-sm">Show time</span>
              <input className="input !min-h-10 w-32" type="time" value={defaults.show_time} onChange={(e) => setDefaults({ ...defaults, show_time: e.target.value })} /></label>
            <button type="button" className="btn btn-ghost !min-h-10"
              onClick={() => setRows((prev) => prev.map((r) => ({ ...r, doors_time: defaults.doors_time || r.doors_time, show_time: defaults.show_time || r.show_time })))}>
              Apply times to all {rows.length}
            </button>
            <p className="muted w-full text-sm">Time zones fill in from the state. Anything you leave blank can be edited on each show later.</p>
          </div>

          <div className="overflow-x-auto rounded-xl border-[1.5px] border-line">
            <table className="w-full min-w-[60rem] text-left text-[0.95rem]">
              <thead className="bg-paper text-sm text-mute">
                <tr>
                  <th className="px-2 py-2 font-semibold">Date</th><th className="px-2 py-2 font-semibold">City</th>
                  <th className="px-2 py-2 font-semibold">State</th><th className="px-2 py-2 font-semibold">Venue</th>
                  <th className="px-2 py-2 font-semibold">Doors</th><th className="px-2 py-2 font-semibold">Show</th>
                  <th className="px-2 py-2 font-semibold">Time zone</th><th className="px-2 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody className="divide-y-[1.5px] divide-line bg-card">
                {rows.map((r) => {
                  const dup = r.show_date && existing.has(r.show_date);
                  const twice = r.show_date && !dup && rows.filter((x) => x.show_date === r.show_date).length > 1;
                  const tzOptions = COMMON_TZ.includes(r.timezone) ? COMMON_TZ : [r.timezone, ...COMMON_TZ];
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="px-2 py-2">
                        <input aria-label="Date" type="date" className={`input !min-h-10 w-40 ${!r.show_date ? "!border-rope" : ""}`} value={r.show_date}
                          onChange={(e) => update(r.key, { show_date: e.target.value, raw_date: undefined })} />
                        {!r.show_date && <p className="mt-1 text-sm text-rope">{r.raw_date ? `Couldn't read "${r.raw_date}"` : "Pick a date"}</p>}
                        {dup && <p className="mt-1 text-sm text-[#8a6d00]">Already a show that day</p>}
                        {twice && <p className="mt-1 text-sm text-[#8a6d00]">Listed twice</p>}
                      </td>
                      <td className="px-2 py-2"><input aria-label="City" className="input !min-h-10 min-w-36" value={r.city} placeholder="TBD" onChange={(e) => update(r.key, { city: e.target.value })} /></td>
                      <td className="px-2 py-2"><input aria-label="State or region" className="input !min-h-10 w-20" value={r.region} onChange={(e) => updateRegion(r.key, e.target.value)} /></td>
                      <td className="px-2 py-2"><input aria-label="Venue" className="input !min-h-10 min-w-44" value={r.venue_name} placeholder="TBD" onChange={(e) => update(r.key, { venue_name: e.target.value })} /></td>
                      <td className="px-2 py-2"><input aria-label="Doors" type="time" className="input !min-h-10 w-32" value={r.doors_time} onChange={(e) => update(r.key, { doors_time: e.target.value })} /></td>
                      <td className="px-2 py-2"><input aria-label="Show time" type="time" className="input !min-h-10 w-32" value={r.show_time} onChange={(e) => update(r.key, { show_time: e.target.value })} /></td>
                      <td className="px-2 py-2">
                        <select aria-label="Time zone" className="input !min-h-10 w-44" value={r.timezone} onChange={(e) => update(r.key, { timezone: e.target.value, tzAuto: false })}>
                          {tzOptions.map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2"><button type="button" className="btn btn-ghost !min-h-10 !px-3" onClick={() => remove(r.key)} aria-label={`Remove ${r.show_date || "row"}`}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form action={action} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="rows" value={JSON.stringify(rows.map(({ key, raw_date, tzAuto, ...r }) => r))} />
            {missingDate > 0
              ? <p className="font-semibold text-rope">{missingDate} {missingDate === 1 ? "row needs" : "rows need"} a date before you can save.</p>
              : <SubmitButton pendingText="Saving…">Save {rows.length} show{rows.length === 1 ? "" : "s"} as drafts</SubmitButton>}
            <button type="button" className="btn btn-ghost" onClick={() => { if (confirm("Clear the whole list?")) setRows([]); }}>Clear list</button>
          </form>
        </div>
      )}
    </section>
  );
}

// ── Calendar ─────────────────────────────────────────────────
function CalendarPicker({ existing, inList, onAdd }: { existing: Set<string>; inList: Set<string>; onAdd: (dates: string[]) => void }) {
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(addDays(todayIso(), 60));
  const [target, setTarget] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const validRange = start && end && start <= end;
  const months = useMemo(() => {
    if (!validRange) return [];
    const out: { y: number; m: number }[] = [];
    const s = fromIso(start), e = fromIso(end);
    let y = s.getUTCFullYear(), m = s.getUTCMonth();
    while ((y < e.getUTCFullYear() || (y === e.getUTCFullYear() && m <= e.getUTCMonth())) && out.length < 13) {
      out.push({ y, m }); m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }, [start, end, validRange]);

  const blocked = (d: string) => existing.has(d) || inList.has(d);
  const inRange = (d: string) => d >= start && d <= end;
  const toggle = (d: string) => setPicked((p) => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const pickWeekday = (wd: number) => {
    const all: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) if (fromIso(d).getUTCDay() === wd && !blocked(d)) all.push(d);
    setPicked((p) => {
      const n = new Set(p);
      const allOn = all.length > 0 && all.every((d) => n.has(d));
      all.forEach((d) => (allOn ? n.delete(d) : n.add(d)));
      return n;
    });
  };
  const goal = parseInt(target, 10);
  const count = picked.size;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="field"><span>First date</span><input className="input w-44" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field"><span>Last date</span><input className="input w-44" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="field"><span>How many shows?</span><input className="input w-28" inputMode="numeric" placeholder="30" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} /></label>
      </div>

      {!validRange ? <p className="text-rope">The last date needs to be after the first date.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[0.95rem]">
            <span className="muted">Pick every</span>
            {WEEKDAYS.map((w, i) => <button key={w} type="button" className="pill !py-1 text-stage hover:bg-paper" onClick={() => pickWeekday(i)}>{w}</button>)}
            {count > 0 && <button type="button" className="ml-2 text-blue hover:underline" onClick={() => setPicked(new Set())}>Clear picks</button>}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {months.map(({ y, m }) => {
              const first = new Date(Date.UTC(y, m, 1));
              const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
              const lead = first.getUTCDay();
              return (
                <div key={`${y}-${m}`}>
                  <p className="mb-2 font-display text-lg font-semibold">{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-mute" aria-hidden>{WEEKDAYS.map((w) => <span key={w}>{w[0]}</span>)}</div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
                    {Array.from({ length: days }).map((_, i) => {
                      const d = `${y}-${pad(m + 1)}-${pad(i + 1)}`;
                      const out = !inRange(d);
                      const taken = blocked(d);
                      const on = picked.has(d);
                      return (
                        <button key={d} type="button" disabled={out || taken} aria-pressed={on}
                          aria-label={`${prettyDate(d)}${taken ? ", already added" : ""}`}
                          onClick={() => toggle(d)}
                          className={`relative aspect-square rounded-lg border-[1.5px] text-sm font-semibold transition-colors
                            ${on ? "border-stage bg-yellow text-stage" : "border-line bg-card hover:border-stage"}
                            ${out ? "!border-transparent !bg-transparent text-line cursor-default" : ""}
                            ${taken && !out ? "!border-dashed !bg-paper text-mute cursor-not-allowed" : ""}`}>
                          {i + 1}
                          {taken && !out && <span aria-hidden className="absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-stage" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {months.length >= 13 && <p className="muted text-sm">Showing the first 13 months. Shorten the range to see the rest.</p>}

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border-2 border-stage bg-card px-4 py-3 shadow-[3px_3px_0_#1b1b1b]">
            <p className="flex-1 font-semibold">
              {Number.isFinite(goal) && goal > 0 ? `${count} of ${goal} picked` : `${count} picked`}
              {Number.isFinite(goal) && goal > 0 && count > goal && <span className="text-[#8a6d00]"> ({count - goal} over)</span>}
            </p>
            <p className="muted hidden text-sm sm:block">Dotted days are already on this tour or in the list.</p>
            <button type="button" className="btn btn-primary" disabled={count === 0}
              onClick={() => { onAdd([...picked].sort()); setPicked(new Set()); }}>
              Add {count || ""} to the list
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Paste / upload ───────────────────────────────────────────
function PasteImport({ defaults, onAdd }: { defaults: Partial<DraftShow>; onAdd: (rows: DraftShow[], msg: string) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = (src: string) => {
    const { rows, headerFound, unreadable } = rowsFromText(src, defaults);
    if (rows.length === 0) { setErr("There's nothing to read yet. Paste some rows or choose a file."); return; }
    setErr(null);
    setText("");
    const parts = [`Read ${rows.length} show${rows.length === 1 ? "" : "s"}`];
    parts.push(headerFound ? "using your column headings." : "as date, city, state, venue.");
    if (unreadable) parts.push(unreadable === 1 ? "1 date couldn't be read and is marked in red." : `${unreadable} dates couldn't be read and are marked in red.`);
    onAdd(rows, parts.join(" "));
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) { setErr("That file is over 1 MB. Save it as a CSV and try again."); return; }
    if (/\.(xlsx|xls|numbers)$/i.test(f.name)) { setErr("Save the spreadsheet as CSV first (File, then Export or Save As), or copy the rows and paste them here."); return; }
    read(await f.text());
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="grid gap-4">
      <label className="field">
        <span>Paste rows from a spreadsheet, routing sheet, or email</span>
        <textarea className="input !min-h-40 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"Date\tCity\tState\tVenue\n10/3/2026\tNashville\tTN\tRyman Auditorium\nOct 4\tAtlanta, GA\tThe Tabernacle"} />
        <small>
          Columns with headings like Date, City, State, Venue, Doors, and Show are matched automatically. Without headings,
          columns are read as date, city, state, venue. Dates like 10/3, Oct 3, or 2026-10-03 all work.
        </small>
      </label>
      {err && <p role="alert" className="font-semibold text-rope">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => read(text)}>Read these rows</button>
        <label className="btn btn-ghost cursor-pointer">
          Upload a CSV
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <a className="text-[0.95rem]" download="tour-dates-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}>Download a template</a>
      </div>
    </div>
  );
}
