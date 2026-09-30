"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Uploads straight to the public storefront bucket (under the artist's folder) and stores the URL in a hidden input. */
export function ImageUpload({ artistId, folder, name, defaultValue, label, hint, aspect = "aspect-[3/1]" }: {
  artistId: string; folder: string; name: string; defaultValue?: string | null; label: string; hint?: string; aspect?: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { setErr("Use a JPG, PNG, WebP, or GIF."); return; }
    if (f.size > 8 * 1024 * 1024) { setErr("That image is over 8 MB."); return; }
    setBusy(true);
    const ext = f.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${artistId}/${folder}/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("storefront").upload(path, f, { contentType: f.type, cacheControl: "31536000" });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (error) { setErr("Upload failed. Try again."); return; }
    setUrl(supabase.storage.from("storefront").getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="field">
      <span>{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className={`relative overflow-hidden rounded-[14px] border-[1.5px] border-dashed border-edge bg-paper ${aspect}`}>
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <span className="absolute inset-0 grid place-items-center text-[14px] font-medium text-mute">{busy ? "Uploading…" : "No image yet"}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-ghost btn-sm cursor-pointer">
          {busy ? "Uploading…" : url ? "Replace image" : "Upload image"}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {url && <button type="button" className="btn btn-text btn-sm" onClick={() => setUrl("")}>Remove</button>}
      </div>
      {hint && <small>{hint}</small>}
      {err && <p className="text-[13px] font-semibold text-rope">{err}</p>}
    </div>
  );
}
