# OnTour Upgrades

Self-serve VIP upgrades for artists, by Please & Thank You. Lives at **upgrades.ontour.vip**.

Stack: Next.js 15 (App Router, TypeScript) on Vercel, Supabase (Postgres, Auth, row-level security), Tailwind CSS 4, Resend for app email.

## Phase 1 (this build)

- Sign up, sign in (password or emailed link), account page
- Roles: P&T Super Admin, Artist (owner), Artist Rep, Accountant. Permissions are enforced in the database with row-level security, not just in the UI
- Artist setup: name, storefront handle, website
- Tours and shows: create, edit, publish, unpublish, cancel, delete drafts
- Team: owner invites reps and accountants by email; invite links expire in 14 days
- Verification: official website and socials, plus one proof (posted or DM'd code, domain-matching email, or one-click confirmation by manager, agent, or label)
- P&T admin: review queue, checklist, approve, request changes, suspend, reinstate, per-artist fee override, managed-program flag, "open their account" (logged), audit log
- Public storefront at `/{handle}` showing published upcoming shows, only once approved

Not in Phase 1: Stripe Connect and card on file, upgrade products, checkout, check-in emails, passes, scanning, photos, settlements, superfans, follow alerts.

## Setup

### 1. GitHub
Repo: https://github.com/edmondmeehan/upgrades (private, on Eddie's personal account). The remote is already set, so from this folder:

```bash
git push -u origin main
```

### 2. Supabase
1. Create a new project, separate from the photos app.
2. SQL editor: paste and run `supabase/migrations/20260929000001_phase1.sql`.
   (Or with the CLI: `supabase link`, then `supabase db push`.)
3. Authentication > URL Configuration:
   - Site URL: `https://upgrades.ontour.vip`
   - Redirect URLs: `https://upgrades.ontour.vip/auth/callback`, `http://localhost:3000/auth/callback`, and your Vercel preview pattern (`https://*-YOUR-TEAM.vercel.app/auth/callback`)
4. Authentication > Emails > SMTP: use the same sender as photos@ontour.vip (e.g. Resend SMTP) so sign-up and sign-in emails come from ontour.vip.
5. Copy the project URL and anon/publishable key from Project Settings > API.

### 3. Vercel
1. Import the GitHub repo.
2. Environment variables (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_SITE_URL=https://upgrades.ontour.vip`, `RESEND_API_KEY`, `EMAIL_FROM="OnTour Upgrades <upgrades@ontour.vip>"`, `ADMIN_NOTIFY_EMAIL=eddie@please.co`
3. Domains: add `upgrades.ontour.vip`. At GoDaddy, add the CNAME record Vercel shows (usually `upgrades` pointing to `cname.vercel-dns.com`).

### 4. Make yourself Super Admin
Sign up in the app with eddie@please.co, then run `supabase/make-super-admin.sql` in the SQL editor.

### 5. Stripe (payments)
P&T's Stripe account is the platform. Artists get Accounts v2 connected accounts (merchant configuration, full Stripe Dashboard, Stripe covers negative balances) and are the seller on direct charges.
1. In Stripe, turn on Connect (Connect, then Get started) and fill in the platform profile and branding.
2. In Vercel, add environment variables, then redeploy:
   - `STRIPE_SECRET_KEY`: Stripe, then Developers, then API keys (start with `sk_test_...`)
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase, then Project Settings, then API keys (the secret service role key)
3. In Stripe, then Developers, then Webhooks, add two endpoints at `https://upgrades.ontour.vip/api/stripe/webhook`:
   - Events on your account: `checkout.session.completed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
   - Events on your account, payload style Thin: `v2.core.account.updated`, `v2.core.account[requirements].updated`, `v2.core.account[configuration.merchant].capability_status_updated`. Put its signing secret in `STRIPE_ACCOUNT_EVENTS_WEBHOOK_SECRET`.
4. P&T admin, then Stripe, shows a checklist of what's connected.

Artists set up payouts and a card on file from Payments in their sidebar.

### 6. Email (Resend, same as photos.ontour.vip)
App emails (invites, verification, approvals) and Supabase sign-in emails go through Resend from `upgrades@ontour.vip`, using the same branded layout as the photos app.
1. Resend: create an API key (Sending access). ontour.vip is already verified for the photos app, so any @ontour.vip sender works.
2. Vercel: add `RESEND_API_KEY`. `EMAIL_FROM` is `Please & Thank You <upgrades@ontour.vip>`.
3. Supabase, then Authentication, then Emails, then SMTP Settings: enable custom SMTP with host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender `upgrades@ontour.vip`, name `Please & Thank You`.
4. Supabase, then Authentication, then Emails, then Templates: paste each file from `supabase/email-templates/` into the matching template, with the subject from `SUBJECTS.txt`.

### Local development
```bash
cp .env.example .env.local   # fill in Supabase values
npm install
npm run dev
```
Without `RESEND_API_KEY`, app emails print to the terminal, and invite links also show on the Team page.

## Testing Phase 1

Use four email addresses (Gmail `+` aliases work, like `you+owner@gmail.com`).

1. **Artist:** sign up as the owner, create an artist, add a tour and two shows, publish one.
2. **Team:** invite a rep and an accountant, and accept each invite in a private window.
   - The rep can edit tours and shows but has no Verification, Team, Settings, or Financials.
   - The accountant sees only Overview and Financials.
3. **Verification:** as owner, submit with each proof type across a few test artists. For the manager option, open the confirm link from the email (or server log).
4. **Admin:** as Eddie, open P&T admin, request changes on one (the owner sees your note and can resubmit), approve another, change a fee, suspend and reinstate.
5. **Storefront:** `/{handle}` returns not found until approved, then lists published upcoming shows. Suspending takes it offline.
6. **Isolation:** signed in on a different artist, paste another artist's `/a/...` URL. You should get "Page not found."

## Data model

- `profiles`: one per login, with the super-admin flag
- `artists`: status, verification code, fee in basis points, managed-lead flag
- `artist_members`: links users to artists with role owner, rep, or accountant
- `invitations`, `verification_submissions` (proof plus reviewer checklist and decision), `tours`, `shows`, `audit_log`

Status changes, fees, invites, team changes, and verification all go through database functions that check permissions and write to the audit log.
