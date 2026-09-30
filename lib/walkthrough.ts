import type { WalkStep } from "@/components/Walkthrough";
import type { MemberRole } from "@/lib/types";

type Ctx = { base: string; artistName: string; firstName: string | null; role: MemberRole | "admin"; approved: boolean;
  hasShows: boolean; hasPackages: boolean; paymentsReady: boolean; hasDesign: boolean };

/** The first-time tour, trimmed to what this person can do. */
export function walkthroughSteps(c: Ctx): WalkStep[] {
  const hi = c.firstName ? `Welcome, ${c.firstName}` : "Welcome to Upgrades";
  if (c.role === "accountant") {
    return [
      { icon: "dollar", eyebrow: "Welcome", title: hi, body: `You have read-only access to ${c.artistName}'s money on Upgrades. Here's where everything is.` },
      { icon: "dollar", eyebrow: "Financials", title: "Show settlements and tour totals", body: "See what each show sold, the fees, refunds and what's owed to the artist, then roll it up by tour and month.", cta: { label: "Open financials", href: `${c.base}/financials` } },
      { icon: "list", eyebrow: "Exports", title: "Payouts and year-end", body: "Match Stripe payouts to the shows they came from, and download year-end exports for taxes. Fan names and emails stay private.", cta: { label: "Open financials", href: `${c.base}/financials` } },
    ];
  }
  const owner = c.role === "owner" || c.role === "admin";
  const steps: WalkStep[] = [
    { icon: "store", eyebrow: "Welcome", title: hi, body: `Upgrades lets ${c.artistName} sell VIP experiences straight to fans: meet & greets, soundchecks, early entry, merch bundles. Here's the one-minute tour.` },
  ];
  if (owner) steps.push({ icon: "badge", eyebrow: "Step 1", title: "Get verified", done: c.approved,
    body: `Before your storefront goes live, P&T confirms you're really ${c.artistName}. Post a code on your socials, use an email on your website's domain, or have your manager or label confirm.`,
    cta: { label: "Go to verification", href: `${c.base}/verification` } });
  steps.push(
    { icon: "calendar", eyebrow: owner ? "Step 2" : "Tours", title: "Add your tour dates", done: c.hasShows,
      body: "Pick dates on a calendar, or paste them straight from a spreadsheet. City, venue and doors can come later; publish a show when it's ready to sell.",
      cta: { label: "Go to tours & shows", href: `${c.base}/tours` } },
    { icon: "star", eyebrow: owner ? "Step 3" : "Packages", title: "Build your VIP packages", done: c.hasPackages,
      body: "Start from a template, set a default price and quantity, then turn it on for any or all shows. The inventory grid shows what's sold and what's left at every date.",
      cta: { label: "Go to VIP packages", href: `${c.base}/packages` } },
  );
  if (owner) steps.push(
    { icon: "card", eyebrow: "Step 4", title: "Get paid", done: c.paymentsReady,
      body: "Connect Stripe and fans pay you directly; money lands in your bank on Stripe's normal schedule. Fans pay a small service fee on top of your price.",
      cta: { label: "Set up payouts", href: `${c.base}/payments` } },
    { icon: "palette", eyebrow: "Step 5", title: "Make your storefront yours", done: c.hasDesign,
      body: "Pick your colors, add a header photo and your genres, then share your link. Every show and package has its own share button with a preview card.",
      cta: { label: "Design your storefront", href: `${c.base}/storefront` } },
  );
  steps.push(
    { icon: "scan", eyebrow: "Show night", title: "Check fans in from your phone", body: "Open Check-in on any phone, tap Start scanning, and point it at the fan's QR pass. No app to install. Search by name if someone forgets their pass.",
      cta: { label: "See check-in", href: `${c.base}/check-in` } },
    { icon: "camera", eyebrow: "After the show", title: "Send the photos", body: "Upload meet & greet photos to the show and press Send. Everyone who bought a package with a photo gets an email with their gallery.",
      cta: { label: "See photos", href: `${c.base}/photos` } },
    { icon: "help", eyebrow: "Your fans", title: "Answer fan questions", body: `Fans contact ${c.artistName} directly through the Fan Support button. Messages land in your inbox and your email, and replies go straight back to them.${owner ? " Invite reps and an accountant under Team to share the work." : ""}`,
      cta: { label: owner ? "You're all set" : "Let's go", href: c.base } },
  );
  return steps;
}
