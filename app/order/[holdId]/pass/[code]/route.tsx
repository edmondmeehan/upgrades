import { ImageResponse } from "next/og";
import { loadOrder } from "@/lib/checkout";
import { qrDataUrl } from "@/lib/qr";


/** A pass image fans can save to their phone's photos: QR, name, show and package. */
export async function GET(_req: Request, { params }: { params: Promise<{ holdId: string; code: string }> }) {
  const { holdId, code } = await params;
  const v = await loadOrder(holdId);
  const idx = v?.passes.findIndex((p) => p.code === code.toUpperCase()) ?? -1;
  if (!v?.order || idx < 0) return new Response("Not found", { status: 404 });
  const qr = await qrDataUrl(v.passes[idx].code, 640);
  const date = new Date(`${v.show.show_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const city = `${v.show.city ?? ""}${v.show.region ? `, ${v.show.region}` : ""}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#130056", color: "#ffffff", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 4, color: "#f2d64b" }}>VIP PASS</div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "#b7b1cc" }}>{`Sold by ${v.artist.name}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1, color: "#f2d64b", textTransform: "uppercase", letterSpacing: -2 }}>{v.artist.name}</div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, marginTop: 20 }}>{v.product.name}</div>
          <div style={{ display: "flex", fontSize: 32, marginTop: 12, color: "#d9d5e6" }}>{`${date}, ${city}`}</div>
          <div style={{ display: "flex", fontSize: 28, marginTop: 6, color: "#b7b1cc" }}>{v.show.venue_name ?? ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", background: "#ffffff", borderRadius: 40, padding: 48, color: "#0b0b0f" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="" width={560} height={560} />
          <div style={{ display: "flex", fontSize: 48, fontWeight: 800, letterSpacing: 8, marginTop: 16, fontFamily: "monospace" }}>{v.passes[idx].code}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#5a5866", marginTop: 8 }}>{`${v.order.fans?.name ?? "Guest"}${v.passes.length > 1 ? `, guest ${idx + 1} of ${v.passes.length}` : ""}`}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1620, headers: { "Content-Disposition": `inline; filename="vip-pass-${code}.png"`, "Cache-Control": "private, max-age=3600" } },
  );
}
