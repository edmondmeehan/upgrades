import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: { default: "OnTour Upgrades", template: "%s · OnTour Upgrades" },
  description: "Sell VIP upgrades to your fans. By Please & Thank You.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#130056" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
