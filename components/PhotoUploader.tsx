"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Uploaded = { path: string; thumb_path: string; width: number; height: number; bytes: number };

async function resize(file: File, max: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
  return { blob, w, h };
}

/** Drag-and-drop uploader: resizes in the browser (full size and thumbnail), uploads straight to storage, then registers the photos. */
export function PhotoUploader({ artistId, showId, register }: { artistId: string; showId: string; register: (items: Uploaded[]) => Promise<{ ok: boolean; added: number }> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  async function handle(files: FileList | File[]) {
    const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!list.length) return;
    const supabase = createClient();
    const state = { done: 0, total: list.length, failed: 0 };
    setProgress({ ...state });
    const uploaded: Uploaded[] = [];
    const queue = [...list];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          const id = crypto.randomUUID();
          const [full, thumb] = await Promise.all([resize(f, 3000, 0.9), resize(f, 640, 0.8)]);
          const base = `${artistId}/${showId}/${id}`;
          const a = await supabase.storage.from("photos").upload(`${base}.jpg`, full.blob, { contentType: "image/jpeg" });
          const b = a.error ? a : await supabase.storage.from("photos").upload(`${base}_t.jpg`, thumb.blob, { contentType: "image/jpeg" });
          if (a.error || b.error) throw new Error("upload");
          uploaded.push({ path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, width: full.w, height: full.h, bytes: full.blob.size });
        } catch { state.failed++; }
        state.done++;
        setProgress({ ...state });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (uploaded.length) await register(uploaded);
    if (input.current) input.current.value = "";
    router.refresh();
    setTimeout(() => setProgress(null), state.failed ? 8000 : 2500);
  }

  const busy = progress && progress.done < progress.total;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) handle(e.dataTransfer.files); }}
      className={`grid justify-items-center gap-3 rounded-[20px] border-2 border-dashed p-8 text-center transition ${drag ? "border-violet bg-[#f1eefc]" : "border-edge bg-white"}`}>
      <p className="text-[17px] font-extrabold">{busy ? `Uploading ${progress!.done} of ${progress!.total}…` : "Drag photos here"}</p>
      {busy ? (
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-[#eceaf2]"><i className="block h-full bg-violet transition-all" style={{ width: `${(progress!.done / progress!.total) * 100}%` }} /></div>
      ) : (
        <>
          <p className="help">JPG, PNG or WebP. Photos are resized for fast phone viewing; you can add as many as you like.</p>
          <label className="btn cursor-pointer">Choose photos
            <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files && handle(e.target.files)} />
          </label>
        </>
      )}
      {progress && !busy && <p role="status" className={`text-[14px] font-semibold ${progress.failed ? "text-rope" : "text-ok"}`}>
        {progress.total - progress.failed} uploaded{progress.failed ? `, ${progress.failed} failed (try those again; iPhone HEIC photos need to be exported as JPG)` : ""}.</p>}
    </div>
  );
}
