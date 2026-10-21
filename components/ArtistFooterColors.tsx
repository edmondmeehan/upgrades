import { contrast, darken, textOn } from "@/lib/color";

/**
 * On artist and show pages, the site footer takes the artist's header color so the page is framed
 * in their brand. A color close to white is darkened slightly so the footer still stands out from
 * the page. Colors are checked hex values from theme(), so they're safe to put in a style rule.
 */
export function ArtistFooterColors({ brand, accent }: { brand: string; accent: string }) {
  const bg = contrast(brand, "#ffffff") < 1.3 ? darken(brand, 0.12) : brand;
  const fg = textOn(bg);
  const hover = contrast(bg, accent) >= 3 ? accent : fg;
  const css = `body:has([data-artist-page]) .site-footer{background:${bg};color:${fg};}
body:has([data-artist-page]) .site-footer p{color:${fg};opacity:.82;}
body:has([data-artist-page]) .site-footer a,body:has([data-artist-page]) .site-footer .site-footer-from a{color:${fg} !important;}
body:has([data-artist-page]) .site-footer a:hover{color:${hover} !important;}`;
  // Same layer as the site's footer styles, so these (more specific) rules win, including over its !important link color.
  return <style dangerouslySetInnerHTML={{ __html: `@layer components{${css}}` }} />;
}
