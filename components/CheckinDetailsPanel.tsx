import { SubmitButton } from "./SubmitButton";
import { formatTime } from "@/lib/util";
import type { CheckinShow } from "@/lib/checkinEmail";

type Pkg = { id: string; name: string; checkin_time: string | null; checkin_notes: string | null };
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** Check-in details for a show, plus the pre-show email's status and send buttons. */
export function CheckinDetailsPanel({ show, pkgs, save, sendNew, sendUpdate, recipients, sentCount }: {
  show: CheckinShow; pkgs: Pkg[]; save: (fd: FormData) => Promise<void>; sendNew: () => Promise<void>; sendUpdate: () => Promise<void>;
  recipients: number; sentCount: number;
}) {
  const ready = !!(show.checkin_time || show.checkin_location);
  const unsent = recipients - sentCount;
  const due = new Date(`${show.show_date}T12:00:00Z`); due.setUTCDate(due.getUTCDate() - show.checkin_email_days);
  const dueLabel = due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section id="checkin" className="panel grid scroll-mt-6 gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>Check-in details</h2>
          <p className="muted mt-1">Fans get these by email before the show, with their QR passes and a map link.</p>
        </div>
        <span className={`badge ${!ready ? "b-pending" : show.checkin_sent_at ? "b-published" : "b-neutral"}`}>
          {!ready ? "Needs details" : show.checkin_sent_at ? `Sent to ${sentCount} of ${recipients}` : `Sends ${dueLabel}`}
        </span>
      </div>

      {show.checkin_updated_at && <p className="alert alert-yellow">You changed the details after the email went out. Send an update so fans have the latest.</p>}

      <form action={save} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <label className="field"><span>Check-in time</span><input type="time" name="checkin_time" defaultValue={hhmm(show.checkin_time)} className="input" /></label>
          <label className="field"><span>Where to go</span><input name="checkin_location" maxLength={300} defaultValue={show.checkin_location ?? ""} className="input" placeholder="VIP table at the box office, left of the main doors" /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <label className="field"><span>Venue street address</span><input name="address" maxLength={200} defaultValue={show.address ?? ""} className="input" placeholder="116 5th Ave N" /><small>{show.venue_name}, {show.city}{show.region ? `, ${show.region}` : ""}. Used for the map link.</small></label>
          <label className="field"><span>ZIP / postal code</span><input name="postal_code" maxLength={20} defaultValue={show.postal_code ?? ""} className="input" /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field"><span>Day-of contact name</span><input name="checkin_contact_name" maxLength={120} defaultValue={show.checkin_contact_name ?? ""} className="input" placeholder="Jess (tour manager)" /></label>
          <label className="field"><span>Day-of contact phone</span><input name="checkin_contact_phone" type="tel" maxLength={40} defaultValue={show.checkin_contact_phone ?? ""} className="input" placeholder="(615) 555-0123" /><small>Shown to ticket holders only, in their email.</small></label>
        </div>
        <label className="field"><span>What fans should know</span><textarea name="checkin_notes" maxLength={2000} defaultValue={show.checkin_notes ?? ""} className="input" placeholder="Bring your concert ticket and a photo ID. Arrive 15 minutes early; late arrivals can't join the meet & greet." /></label>

        {pkgs.length > 1 && (
          <div className="grid gap-3 rounded-2xl bg-paper p-4">
            <p className="text-[14px] font-extrabold">Different time or notes for a package?</p>
            {pkgs.map((p) => (
              <div key={p.id} className="grid gap-2 sm:grid-cols-[180px_130px_minmax(0,1fr)] sm:items-end">
                <span className="text-[14px] font-semibold sm:pb-3">{p.name}</span>
                <label className="field"><span className="!text-[12px]">Check-in time</span><input type="time" name={`pkg_time_${p.id}`} defaultValue={hhmm(p.checkin_time)} className="input input-sm" /></label>
                <label className="field"><span className="!text-[12px]">Extra notes</span><input name={`pkg_notes_${p.id}`} maxLength={1000} defaultValue={p.checkin_notes ?? ""} className="input input-sm" placeholder="Meet at the side stage door" /></label>
              </div>
            ))}
            <small className="help">Leave blank to use the show&apos;s check-in time. {show.checkin_time ? `Currently ${formatTime(show.checkin_time)}.` : ""}</small>
          </div>
        )}
        {pkgs.length === 1 && <input type="hidden" name={`pkg_time_${pkgs[0].id}`} value={hhmm(pkgs[0].checkin_time)} />}

        <label className="field max-w-xs"><span>Send the email</span>
          <select name="checkin_email_days" defaultValue={String(show.checkin_email_days)} className="input">
            {[0, 1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d === 0 ? "Morning of the show" : `${d} day${d === 1 ? "" : "s"} before`}</option>)}
          </select>
          <small>Goes out late morning Eastern. Fans who buy after that get the details in their order confirmation.</small>
        </label>
        <div><SubmitButton variant="dark" pendingText="Saving…">Save check-in details</SubmitButton></div>
      </form>

      {ready && recipients > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          {unsent > 0 && (
            <form action={sendNew}><SubmitButton pendingText="Sending…" confirm={`Email check-in details to ${unsent} fan${unsent === 1 ? "" : "s"} now?`}>
              Send now to {unsent} fan{unsent === 1 ? "" : "s"}</SubmitButton></form>
          )}
          {sentCount > 0 && (
            <form action={sendUpdate}><SubmitButton variant="ghost" pendingText="Sending…" confirm={`Send updated details to all ${recipients} fans?`}>
              Send an update to all {recipients}</SubmitButton></form>
          )}
          <span className="help">{recipients} fan{recipients === 1 ? "" : "s"} with passes for this show.</span>
        </div>
      )}
    </section>
  );
}
