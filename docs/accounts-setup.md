# Accounts and hosted data (private beta, owner only)

Written 22 October 2026. The code for this is in the repository and tested, but **it has not been run against a real Supabase project** (none exists yet; creating one needs your account). The database rules were tested in a real Postgres engine; the sign-in flow was tested with stand-ins for Supabase. Expect to fix small dashboard-setting mismatches on first contact, and tell me what you see.

## How it fits together

| Piece | Job | Where it runs |
|---|---|---|
| Vercel | Hosts the web app (the part you open on phone and desktop) | Cloud |
| Supabase Auth | Sign-in: emailed link or Google. No passwords | Cloud |
| Supabase Postgres | Your preferences, saved items and the published listings | Cloud |
| Collection, translation, publishing | Spends provider credits, writes listings | **Your computer only** |

Three independent locks keep it private. Break one and the others still hold:

1. **Supabase:** "Allow new users to sign up" is off, so an unknown email cannot create an account, by link or by Google.
2. **The app:** every page and API checks for a verified session; a full page load also checks the invite list. Signed-out requests are redirected (pages) or get 401 (APIs).
3. **The database:** row-level security reads the `allowed_users` table. A valid session for an email that is not listed reads and writes nothing, even if it calls Supabase directly.

**Collection stays owner-only** because it never runs in the cloud. The provider keys and the Supabase service-role key live only in `.env.local` on your computer; `npm run env:check` fails if they appear in a hosted environment. A browser session, even yours, has no permission to write listings: only `npm run publish` on your machine can.

## One-time setup

### 1. Create the project
supabase.com → New project. Pick a region near Sweden. Save the database password somewhere safe (you will not need it day to day).

### 2. Create the tables
SQL Editor → paste `supabase/migrations/20261022000000_private_beta.sql` → Run. Then invite yourself (lowercase):

```sql
insert into public.allowed_users (email, role) values ('you@example.com', 'owner');
```

### 3. Turn off public sign-up, then create your own account
- Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
- Authentication → Users → **Add user** → Create new user with your email, tick Auto Confirm. The password is never used.

### 4. Tell Supabase where the app lives
Authentication → URL Configuration:
- Site URL: your Vercel address (add it after step 7; use `http://127.0.0.1:3000` while testing locally).
- Redirect URLs: `https://YOUR-APP.vercel.app/auth/callback`, `https://YOUR-APP.vercel.app/auth/confirm`, and for local testing `http://127.0.0.1:3000/**`.

### 5. Email link that works on any device
By default a link must be opened in the same browser that asked for it. To open it from your phone after asking on your desktop (or the reverse), edit Authentication → Email Templates → **Magic Link** to:

```html
<h2>Sign in to FORME</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
```

Supabase's built-in email sender has a very small hourly limit. That is fine for one person; add your own SMTP provider later if you hit it.

### 6. Google (optional, but quicker than waiting for email)
Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application. Add the redirect URI shown on Supabase's Google provider page (Authentication → Providers → Google), then paste the client ID and secret into that page and enable it. Your Google account's email must match the one you invited.

### 7. Keys and deploy
Supabase → Project Settings → API (or API Keys). You need:
- **Project URL** and **publishable key**: these are safe for the browser.
- **Service-role / secret key**: owner's computer only.

On your computer, in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # never anywhere else
```

On Vercel (import the GitHub repo), set **only** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and, optionally, `HEALTH_TOKEN`. Do not add the service-role key or any provider key. Run `npm run env:check` locally; run it with the Vercel variables to be sure.

### 8. Publish your listings
`npm run publish` sends `public/data/vinted.json` (after validation) to Postgres. It refuses an empty snapshot or a sudden large shrink unless you add `--force`. Run it after each collection.

## Check the setup with one command

`npm run auth:check` makes read-only requests with the **publishable** key only and tells you, in plain words, whether: the project is reachable, public sign-up is off, email (and Google) sign-in are enabled, the four tables and `save_profile` exist, and a signed-out visitor is refused on all of them. It prints no keys and changes nothing.

`npm run auth:check -- --owner` additionally reads your invite list and user list with the service-role key from your own `.env.local`, and checks that an owner is invited, every invited address has a Supabase user, and no uninvited user exists. It reads only.

This proves the dashboard and database settings. It cannot prove that an email arrives or that Google's consent screen works; that is step 1–5 below.

## Checking it works

1. Open the Vercel address signed out: you land on the login page.
2. Request a link, open it on your phone: you are in. Open the same address on your desktop, sign in too.
3. Change a brand on your phone; bring the desktop tab to the foreground: it picks the change up. Settings → Account shows the sync state.
4. From a Google account that is **not** on the list, press Continue with Google: you see "That account isn't on the invite list" and nothing else.
5. Settings → Account → Sign out, then confirm a page refresh sends you to login.

## What happens to what you already have
- First sign-in on a device with no earlier sync: your browser's preferences are uploaded to your account.
- A second device, or the first sync after the account already has a profile: the **account version wins**, and this browser's copy is kept under `localStorage` key `forme-v2-before-sync`, with a notice.
- Two devices edit at once: the later save is refused, the device adopts the newer version and tells you. Sidebar state and demo/live mode stay per device.
- Offline: edits are kept and sync when the connection returns ("Try again" forces it).

## Adding someone later
`insert into public.allowed_users (email, role) values ('friend@example.com', 'member');`, then create them under Authentication → Users (sign-up is off). Remove the row to revoke access immediately. Members cannot collect or publish, and each person's preferences are private to them.

## Known limits
- Supabase's built-in email sender is heavily rate-limited and some addresses never receive its messages. For anything beyond a quick test, add your own SMTP provider (Authentication → SMTP Settings) or use Google sign-in.
- A fresh checkout has no listings. The Home banner now says "No live listings are available yet" rather than failing; run a collection, then `npm run publish` for the hosted app.
- Not yet run against a real Supabase project (see top). Dashboard labels may differ slightly from the names above.
- Proxy only checks that a session cookie is valid; the invite check happens on full page loads and on every API call, as the Next.js auth guide recommends.
- A removed invitee's existing session still passes Proxy until it expires, but sees no data (APIs and the database refuse them, and a page load signs them out to the login page).
- Hosted refresh from your phone is not built: collection needs your computer. A later step could let the phone queue a run for your computer to pick up.
- Published listings include marketplace titles and photo links. Check the provider's terms for caching and re-displaying them before sharing the app with anyone else.
