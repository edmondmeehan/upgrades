import { ImageResponse } from "next/og";
import { theme, type Store, type StoreShow, cityOf } from "@/lib/storefront";
import { dollars } from "@/lib/packages";

export const OG_SIZE = { width: 1200, height: 630 };

/** Share card: artist colors and header image, name, and (for a show) city, date, and packages. */
export function ogCard(s: Store, sh?: StoreShow) {
  const t = theme(s);
  const date = sh ? new Date(`${sh.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
  const from = sh?.packages.length ? Math.min(...sh.packages.map((p) => p.price_cents)) : null;
  const upcoming = s.shows.filter((x) => x.packages.length).length;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: t.brand, color: t.fg, fontFamily: "sans-serif" }}>
        {s.header_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.header_image_url} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ position: "absolute", inset: 0, display: "flex", background: `linear-gradient(90deg, ${t.brand} 0%, ${t.brand}ee 45%, ${t.brand}88 100%)` }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", opacity: 0.9 }}>VIP upgrades</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 900 }}>
            <div style={{ display: "flex", fontSize: s.name.length > 18 ? 76 : 96, fontWeight: 800, lineHeight: 0.95, letterSpacing: -3, textTransform: "uppercase", color: t.accent }}>{s.name}</div>
            {sh ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>{cityOf(sh)}</div>
                <div style={{ display: "flex", fontSize: 32, fontWeight: 600, opacity: 0.9 }}>{date}</div>
              </div>
            ) : s.tagline ? (
              <div style={{ display: "flex", fontSize: 36, fontWeight: 600, opacity: 0.9 }}>{s.tagline}</div>
            ) : null}
            {sh && <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>{sh.venue}</div>}
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {(sh ? sh.packages.slice(0, 3).map((p) => p.name) : [`${upcoming || s.shows.length} upcoming show${(upcoming || s.shows.length) === 1 ? "" : "s"}`]).map((label) => (
              <div key={label} style={{ display: "flex", padding: "12px 22px", borderRadius: 999, background: t.accent, color: t.accentFg, fontSize: 26, fontWeight: 700 }}>{label}</div>
            ))}
            {from != null && <div style={{ display: "flex", padding: "12px 22px", fontSize: 26, fontWeight: 700 }}>{`from ${dollars(from)}`}</div>}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

export function ogFallback() {
  return new ImageResponse(
    (<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#130056", color: "#f2d64b", fontSize: 96, fontWeight: 800 }}>OnTour Upgrades</div>),
    OG_SIZE,
  );
}
