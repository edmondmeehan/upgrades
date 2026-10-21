# Supabase sign-in emails

These six templates are generated from the same layout as every other OnTour Access email
(`lib/email.ts`). To change them, edit `scripts/build-auth-templates.mts`, then run:

    NEXT_PUBLIC_SITE_URL=https://upgrades.ontour.vip node --experimental-strip-types scripts/build-auth-templates.mts

## 1. Send from our own address (do this first)

Supabase, then **Authentication**, then **Emails**, then the **SMTP Settings** tab. Turn on **Enable custom SMTP** and enter:

| Field | Value |
| --- | --- |
| Sender email | upgrades@ontour.vip |
| Sender name | Please & Thank You |
| Host | smtp.resend.com |
| Port | 465 |
| Username | resend |
| Password | a Resend API key (create a "Sending access" key just for Supabase at resend.com/api-keys) |

Save. Then **Authentication**, then **Rate Limits**: raise "Rate limit for sending emails" (Supabase's own mailer allows only a few per hour; with custom SMTP you can set e.g. 100).

ontour.vip must have its Resend DNS records (DKIM, SPF, DMARC) for this address to be trusted.

## 2. Allow the reset-password link to come back to the site

**Authentication**, then **URL Configuration**:
- Site URL: `https://upgrades.ontour.vip`
- Redirect URLs: add `https://upgrades.ontour.vip/auth/callback**`

## 3. Paste each template

**Authentication**, then **Emails**, then the **Templates** tab. For each template: open it, set the **Subject**, switch the editor to the code/source view, select all, delete, paste the whole file, and **Save changes**.

| Supabase template | Subject | File |
| --- | --- | --- |
| Confirm signup | Confirm your OnTour Access account | confirm-signup.html |
| Invite user | You've been invited to OnTour Access | invite.html |
| Magic link | Your OnTour Access sign-in link | magic-link.html |
| Change Email Address | Confirm your new email address | change-email.html |
| Reset Password | Reset your OnTour Access password | reset-password.html |
| Reauthentication | Your OnTour Access verification code | reauthentication.html |

Leave the `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` and `{{ .Token }}` parts exactly as they are; Supabase fills them in.

## 4. Test

- Sign-in link: on /login, enter your email and tap "Email me a sign-in link".
- Reset password: /forgot-password.
- Confirm signup: create an account at /signup with a new address (for example you+test@please.co).
