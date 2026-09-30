"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { isHex } from "@/lib/color";
import { GENRES } from "@/lib/genres";
import { cleanError, withMsg } from "@/lib/util";

const img = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storefront/`;
  return s.startsWith(base) ? s : null; // only images uploaded to our storefront bucket
};

export async function saveStorefront(artistId: string, fd: FormData) {
  const { supabase, artist } = await requireArtist(artistId, ["owner"]);
  const brand = String(fd.get("brand_color") ?? ""), accent = String(fd.get("accent_color") ?? "");
  const { error } = await supabase.from("artists").update({
    brand_color: isHex(brand) ? brand.toLowerCase() : null,
    accent_color: isHex(accent) ? accent.toLowerCase() : null,
    header_image_url: img(fd.get("header_image_url")),
    avatar_url: img(fd.get("avatar_url")),
    tagline: String(fd.get("tagline") ?? "").trim().slice(0, 140) || null,
    bio: String(fd.get("bio") ?? "").trim().slice(0, 600) || null,
    genres: String(fd.get("genres") ?? "").split(",").filter((g) => (GENRES as readonly string[]).includes(g)).slice(0, 3),
  }).eq("id", artistId);
  revalidatePath(`/${artist.handle}`);
  revalidatePath("/");
  redirect(withMsg(`/a/${artistId}/storefront`, error ? "err" : "ok", error ? cleanError(error) : "Storefront saved."));
}
