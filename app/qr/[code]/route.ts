import { isPassCode, qrPng } from "@/lib/qr";

// QR image for emails (email apps don't render inline SVG). It only encodes the code it's given.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.replace(/\.png$/i, "").toUpperCase();
  if (!isPassCode(code)) return new Response("Not found", { status: 404 });
  const png = await qrPng(code, 480);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
}
