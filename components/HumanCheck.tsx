"use client";
import { useEffect, useRef } from "react";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void }; __tsLoading?: Promise<void> } }

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!window.__tsLoading) {
    window.__tsLoading = new Promise((res) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true; s.onload = () => res();
      document.head.appendChild(s);
    });
  }
  return window.__tsLoading;
}

/** Cloudflare's "are you human" check. Usually invisible; only shows a box when Cloudflare isn't sure. Off until a site key is set. */
export function HumanCheck() {
  const box = useRef<HTMLDivElement>(null);
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!key || !box.current) return;
    let id: string | undefined, gone = false;
    loadScript().then(() => {
      if (gone || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: key, appearance: "interaction-only", "response-field-name": "cf-turnstile-response" });
    });
    return () => { gone = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [key]);
  if (!key) return null;
  return <div ref={box} className="empty:hidden" />;
}
