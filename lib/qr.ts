import QRCode from "qrcode";

/** What the QR encodes. The scanner also accepts the bare code typed in by hand. */
export const qrPayload = (code: string) => `ONTOUR-PASS:${code}`;
export const isPassCode = (c: string) => /^[A-F0-9]{8,16}$/.test(c);

export function qrSvg(code: string) {
  return QRCode.toString(qrPayload(code), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0b0f", light: "#ffffff" } });
}
export function qrPng(code: string, width = 480) {
  return QRCode.toBuffer(qrPayload(code), { type: "png", margin: 1, width, errorCorrectionLevel: "M" });
}
export function qrDataUrl(code: string, width = 600) {
  return QRCode.toDataURL(qrPayload(code), { margin: 1, width, errorCorrectionLevel: "M" });
}
