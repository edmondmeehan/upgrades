import Link from "next/link";

const SRC = "https://please.co/cdn/shop/files/PTY_Logo_Type_Yellow_WhiteText.png?v=1768929642&width=880";

/** Please & Thank You logo. On light backgrounds it sits in a navy chip, as on photos.ontour.vip. */
export function Logo({ href = "/", size = 40, chip = false, label = "OnTour Upgrades home" }: { href?: string; size?: number; chip?: boolean; label?: string }) {
  const w = Math.round(size * 2.9);
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SRC} alt="Please & Thank You" width={w} height={size} style={{ display: "block", height: size, width: w, maxWidth: "none", objectFit: "contain" }} />
  );
  return (
    <Link href={href} aria-label={label} className="inline-flex shrink-0 leading-none !no-underline">
      {chip ? <span className="inline-flex rounded-[14px] bg-navy px-3 py-2">{img}</span> : img}
    </Link>
  );
}
