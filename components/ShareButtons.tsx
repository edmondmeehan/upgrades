"use client";
import { useEffect, useState } from "react";

const Svg = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const ICONS = {
  x: "M4 4l16 16M20 4L4 20",
  facebook: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8a0 0 0 0 1 0 0z",
  whatsapp: "M20 12a8 8 0 0 1-11.8 7L4 20l1-4.1A8 8 0 1 1 20 12zM9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.5-1.8-1.3-2.3-2.3l.8-1-1-2L9 9.5z",
  threads: "M16.5 11.5c-.4-3-2.3-4.5-4.6-4.5-2.8 0-4.9 2.2-4.9 5.2 0 3.2 2 5.3 5 5.3 2.3 0 4-1.2 4-3.1 0-1.7-1.3-2.7-3.4-2.7-2 0-3.1 1-3.1 2.2",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  sms: "M4 5h16v11H9l-5 4zM8 10h.01M12 10h.01M16 10h.01",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  share: "M12 3v12M7 8l5-5 5 5M5 14v5h14v-5",
};

/** Share a storefront, show, or package: native share sheet on phones, plus direct links for each network. */
export function ShareButtons({ url, title, text, compact = false, tone = "light", menu = false }: { url: string; title: string; text: string; compact?: boolean; tone?: "light" | "dark"; menu?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  useEffect(() => { setCanNative(typeof navigator !== "undefined" && !!navigator.share); }, []);
  const e = encodeURIComponent;
  const links: [keyof typeof ICONS, string, string][] = [
    ["x", "X", `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`],
    ["facebook", "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`],
    ["threads", "Threads", `https://www.threads.net/intent/post?text=${e(`${text} ${url}`)}`],
    ["whatsapp", "WhatsApp", `https://wa.me/?text=${e(`${text} ${url}`)}`],
    ["sms", "Text", `sms:?&body=${e(`${text} ${url}`)}`],
    ["mail", "Email", `mailto:?subject=${e(title)}&body=${e(`${text}\n\n${url}`)}`],
  ];
  const btn = tone === "dark"
    ? "bg-white/15 text-white hover:bg-white/25"
    : "bg-white text-ink shadow-[inset_0_0_0_1.5px_#d6d3e0] hover:bg-paper";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  if (menu) {
    // One "Share" button: the phone's share sheet where available, otherwise a labeled list.
    return (
      <details className="group relative">
        <summary onClick={(ev) => { if (canNative) { ev.preventDefault(); navigator.share({ title, text, url }).catch(() => null); } }}
          className={`inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold [&::-webkit-details-marker]:hidden ${btn}`}>
          <Svg d={ICONS.share} />Share
        </summary>
        <div className="absolute left-0 z-20 mt-2 grid w-52 gap-0.5 rounded-2xl border border-line bg-white p-1.5 text-ink shadow-[0_16px_40px_rgba(0,0,0,.12)]">
          {links.map(([k, label, href]) => (
            <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] font-semibold text-ink !no-underline hover:bg-paper">
              <Svg d={ICONS[k]} />{label}
            </a>
          ))}
          <button type="button" onClick={copy} className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-left text-[14px] font-semibold hover:bg-paper">
            <Svg d={ICONS.link} />{copied ? "Link copied" : "Copy link"}
          </button>
          <p className="px-3 pb-1.5 pt-1 text-[12px] text-mute">For Instagram or TikTok, copy the link and add it to your story or bio.</p>
        </div>
      </details>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canNative && (
        <button type="button" onClick={() => navigator.share({ title, text, url }).catch(() => null)} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${btn}`}>
          <Svg d={ICONS.share} />Share
        </button>
      )}
      {links.map(([k, label, href]) => (
        <a key={k} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${label}`} title={label}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full !no-underline ${compact ? "w-9 justify-center" : "px-3.5"} text-[13px] font-bold ${btn}`}>
          <Svg d={ICONS[k]} />{!compact && label}
        </a>
      ))}
      <button type="button" onClick={copy} aria-label="Copy link" className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${btn}`}>
        <Svg d={ICONS.link} />{copied ? "Copied" : compact ? "Copy" : "Copy link"}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? "Link copied" : ""}</span>
    </div>
  );
}
