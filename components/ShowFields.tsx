import type { Show } from "@/lib/types";
import { COMMON_TZ, tzLabel } from "@/lib/timezones";

export function ShowFields({ show, currencyLocked = false }: { show?: Partial<Show> & { currency?: string }; currencyLocked?: boolean }) {
  const others = Intl.supportedValuesOf("timeZone").filter((z) => !COMMON_TZ.includes(z));
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="field"><span>Date</span><input className="input" type="date" name="show_date" required defaultValue={show?.show_date} /></label>
        <label className="field"><span>Doors</span><input className="input" type="time" name="doors_time" defaultValue={show?.doors_time?.slice(0, 5) ?? ""} /></label>
        <label className="field"><span>Show time</span><input className="input" type="time" name="show_time" defaultValue={show?.show_time?.slice(0, 5) ?? ""} /></label>
      </div>
      <label className="field"><span>Venue</span><input className="input" name="venue_name" defaultValue={show?.venue_name ?? ""} placeholder="TBD" /></label>
      <label className="field"><span>Street address</span><input className="input" name="address" defaultValue={show?.address ?? ""} /></label>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_5rem]">
        <label className="field"><span>City</span><input className="input" name="city" defaultValue={show?.city ?? ""} placeholder="TBD" /></label>
        <label className="field"><span>State or region</span><input className="input" name="region" defaultValue={show?.region ?? ""} /></label>
        <label className="field"><span>Postal code</span><input className="input" name="postal_code" defaultValue={show?.postal_code ?? ""} /></label>
        <label className="field"><span>Country</span><input className="input uppercase" name="country" maxLength={2} defaultValue={show?.country ?? "US"} /></label>
      </div>
      <label className="field max-w-xs"><span>Currency fans pay in</span>
        <select name="currency" className="input" defaultValue={show?.currency ?? ""} disabled={currencyLocked}>
          {!show?.currency && <option value="">Automatic, from the country</option>}
          <option value="usd">US dollars (USD)</option><option value="gbp">British pounds (GBP)</option><option value="eur">Euros (EUR)</option>
          <option value="cad">Canadian dollars (CAD)</option><option value="aud">Australian dollars (AUD)</option>
        </select>
        <small>{currencyLocked ? "This show has sales, so its currency can't change." : "Prices, checkout and this show's settlement use this currency."}</small>
      </label>
      <label className="field">
        <span>Venue time zone</span>
        <select className="input" name="timezone" defaultValue={show?.timezone ?? "America/New_York"}>
          <optgroup label="Common">{COMMON_TZ.map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}</optgroup>
          <optgroup label="All time zones">{others.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</optgroup>
        </select>
        <small>Check-in emails and reminders are timed in this zone.</small>
      </label>
    </div>
  );
}
