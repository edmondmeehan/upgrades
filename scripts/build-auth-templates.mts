/**
 * Builds the Supabase Auth email templates from the same layout as every other email.
 * Run: NEXT_PUBLIC_SITE_URL=https://upgrades.ontour.vip node --experimental-strip-types scripts/build-auth-templates.mts
 * Output: supabase/email-templates/*.html and SUBJECTS.txt, to paste into Supabase (see README there).
 * {{ .ConfirmationURL }}, {{ .Email }}, {{ .NewEmail }} and {{ .Token }} are filled in by Supabase.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { renderEmail, type EmailContent } from "../lib/email.ts";

const T: { file: string; dashboard: string; subject: string; content: EmailContent }[] = [
  { file: "magic-link", dashboard: "Magic link", subject: "Your OnTour Upgrades sign-in link",
    content: { eyebrow: "Sign in", title: "Your sign-in link", preheader: "Tap to sign in to OnTour Upgrades.",
      body: ["Tap the button to sign in to OnTour Upgrades as {{ .Email }}. The link works once and expires within an hour."],
      button: { label: "Sign in", url: "{{ .ConfirmationURL }}" },
      footnote: "If you didn't ask to sign in, ignore this email. Your account is safe." } },
  { file: "confirm-signup", dashboard: "Confirm signup", subject: "Confirm your OnTour Upgrades account",
    content: { eyebrow: "Welcome", title: "Confirm your email", preheader: "One tap to finish setting up OnTour Upgrades.",
      body: ["Thanks for signing up for OnTour Upgrades. Confirm that {{ .Email }} is your email to finish setting up your account."],
      button: { label: "Confirm my email", url: "{{ .ConfirmationURL }}" },
      footnote: "If you didn't create an account, ignore this email." } },
  { file: "reset-password", dashboard: "Reset Password", subject: "Reset your OnTour Upgrades password",
    content: { eyebrow: "Password", title: "Reset your password", preheader: "Choose a new password for OnTour Upgrades.",
      body: ["We got a request to reset the password for {{ .Email }}. Tap the button to choose a new one."],
      button: { label: "Choose a new password", url: "{{ .ConfirmationURL }}" },
      footnote: "The link works once and expires within an hour. If you didn't ask for this, ignore this email and your password won't change." } },
  { file: "change-email", dashboard: "Change Email Address", subject: "Confirm your new email address",
    content: { eyebrow: "Account", title: "Confirm your new email", preheader: "Confirm the change to your OnTour Upgrades email.",
      body: ["You asked to change your OnTour Upgrades email from {{ .Email }} to {{ .NewEmail }}. Confirm to finish the change."],
      button: { label: "Confirm new email", url: "{{ .ConfirmationURL }}" },
      footnote: "If you didn't ask for this, ignore this email and contact help.please.co." } },
  { file: "invite", dashboard: "Invite user", subject: "You've been invited to OnTour Upgrades",
    content: { eyebrow: "Invite", title: "You're invited to OnTour Upgrades", preheader: "Accept your invite to OnTour Upgrades.",
      body: ["You've been invited to OnTour Upgrades, where artists sell VIP upgrades for their shows. Accept the invite to set up your account."],
      button: { label: "Accept the invite", url: "{{ .ConfirmationURL }}" },
      footnote: "If you weren't expecting this, ignore this email." } },
  { file: "reauthentication", dashboard: "Reauthentication", subject: "Your OnTour Upgrades verification code",
    content: { eyebrow: "Verify it's you", title: "Your verification code", preheader: "Enter this code in OnTour Upgrades.",
      body: ["Enter this code in OnTour Upgrades to confirm it's you."], code: "{{ .Token }}",
      footnote: "If you didn't ask for a code, ignore this email and consider changing your password." } },
];

mkdirSync("supabase/email-templates", { recursive: true });
for (const t of T) writeFileSync(`supabase/email-templates/${t.file}.html`, renderEmail(t.content).html);
writeFileSync("supabase/email-templates/SUBJECTS.txt", T.map((t) => `${t.dashboard} (${t.file}.html): ${t.subject}`).join("\n") + "\n");
console.log(T.map((t) => `${t.file}.html  ${renderEmail(t.content).html.length} bytes`).join("\n"));
