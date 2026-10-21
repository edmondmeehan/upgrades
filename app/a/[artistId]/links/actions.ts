"use server";
import { redirect } from "next/navigation";
import { requireArtist } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { PLATFORMS, isPlatform, place, shortDate, showLink, storeLink, type Platform } from "@/lib/linkExport";
import { withMsg } from "@/lib/util";
import { exportShows } from "./data";

/** Email the links (with instructions) to whoever runs Bandsintown, Seated, Laylo or the link in bio. */
export async function sendLinks(artistId: string, fd: FormData) {
  const { supabase, artist, profile } = await requireArtist(artistId, ["owner", "rep"]);
  const tour = String(fd.get("tour") ?? "") || null;
  const back = `/a/${artistId}/links${tour ? `?tour=${tour}` : ""}`;
  const to = String(fd.get("to") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) redirect(withMsg(back, "err", "Enter the email address to send to."));
  const picked = fd.getAll("platform").map(String).filter(isPlatform) as Platform[];
  if (!picked.length) redirect(withMsg(back, "err", "Pick at least one platform."));
  const shows = await exportShows(supabase, artistId, tour);
  if (!shows.length) redirect(withMsg(back, "err", "There are no upcoming published dates to send."));
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000);
  const sender = profile.name || profile.email;
  const names = picked.map((p) => PLATFORMS[p].label);

  const { sent, error } = await sendEmail({
    to, replyTo: profile.email,
    subject: `${artist.name} VIP links for ${names.join(", ")}`,
    eyebrow: "VIP links", title: `${artist.name} VIP links`,
    preheader: `${shows.length} date${shows.length === 1 ? "" : "s"} for ${names.join(", ")}, from ${sender}.`,
    body: [
      `${sender} sent you the VIP upgrade links for ${artist.name}'s ${shows.length} upcoming date${shows.length === 1 ? "" : "s"}, to add to ${names.join(", ")}.`,
      ...(note ? [note] : []),
      ...picked.flatMap((p) => [`${PLATFORMS[p].label}: ${PLATFORMS[p].steps.join(" ")}`]),
      "Each link is tagged for its platform, so please use the link from that platform's table.",
    ],
    tables: picked.map((p) => ({
      title: PLATFORMS[p].label,
      head: ["Date", "City", "Link"],
      rows: [...(p === "laylo" || p === "linkinbio" ? [["All dates", "Storefront", storeLink(artist.handle, p)]] : []),
        ...shows.map((s) => [shortDate(s.show_date), `${place(s)}${s.venue_name ? `, ${s.venue_name}` : ""}`, showLink(artist.handle, s.slug, p)])],
    })),
    footnote: `Questions? Reply to this email to reach ${sender}.`,
  });
  redirect(withMsg(back, sent ? "ok" : "err", sent ? `Sent the ${names.join(", ")} links to ${to}.` : `The email didn't send: ${error ?? "unknown error"}`));
}
