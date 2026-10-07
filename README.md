# My Calendar

A self-hosted, single-host meeting scheduler (like Calendly) on Firebase.

- Guests pick a free slot at `https://<your-site>/<meeting-type>`; no account needed.
- Free slots = your weekly hours − date overrides − existing bookings − busy time in your Google Calendar.
- Each booking is added to your Google Calendar with a Google Meet link, and the guest gets the invite.
- Resend sends confirmation, cancellation and 24-hour reminder emails. Guests can cancel from a private link.
- You manage everything at `/admin` (sign in with your Google account).

## Stack

| Part | Tech |
|---|---|
| Frontend (`web/`) | React 19, Vite, TypeScript, Tailwind CSS v4, Luxon, React Router |
| API (`functions/`) | Cloud Functions 2nd gen, Express 5, Zod, Luxon |
| Data | Firestore (browser access fully denied; the API uses the Admin SDK) |
| Auth | Firebase Auth with Google, restricted to `HOST_EMAIL` |
| Calendar | Google Calendar API (free/busy, events, Meet) via OAuth refresh token |
| Email | Resend |
| Hosting | Firebase Hosting; `/api/**` is rewritten to the `api` function |

Routes: `/` (meeting types), `/:slug` (book), `/booking/:id?token=…` (view/cancel), `/admin/*`.

## One-time setup

### 1. Firebase project
1. Create a project at https://console.firebase.google.com and upgrade it to the **Blaze** plan (needed for Functions).
2. **Firestore**: create a database (Native mode).
3. **Authentication → Sign-in method**: enable **Google**.
4. **Project settings → Your apps**: add a **Web app** and copy its config into `web/.env.local` (see `web/.env.example`).
5. Put your project ID in `.firebaserc`.
6. Install the CLI: `npm i -g firebase-tools`, then `firebase login`.

### 2. Google Calendar access (Google Cloud Console, same project)
1. **APIs & Services → Library**: enable **Google Calendar API**.
2. **OAuth consent screen**: User type *External*. Add the scopes `calendar.events` and `calendar.freebusy`.
   Then set **Publishing status → In production**. In *Testing* mode Google expires the refresh token after 7 days and sync stops.
   You'll see an "unverified app" warning when you connect. That's fine, since you're the only user.
3. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URIs:
   - `https://<project-id>.web.app/api/google/callback` (and your custom domain if you add one)
   - `http://localhost:5173/api/google/callback` (local dev)

### 3. Resend
Verify your sending domain in Resend and create an API key.

### 4. Function config
```bash
cp functions/.env.example functions/.env       # fill in HOST_EMAIL, APP_URL, EMAIL_FROM, GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set RESEND_API_KEY
```

### 5. Deploy
```bash
npm --prefix functions install
npm --prefix web install
firebase deploy
```

### 6. First run
1. Open `/admin` and sign in with `HOST_EMAIL`.
2. **Settings**: set your name and **Connect Google Calendar**.
3. **Availability**: check the time zone and weekly hours, then **Save**.
4. **Meeting types**: create one (e.g. `30min`, Google Meet) and share `https://<site>/30min`.

## Local development

Needs **Java 21+** and the Firebase CLI. Runs on the `demo-mycalendar` demo project, so no real Firebase project is needed.
Local config is already in `functions/.env.local`, `functions/.secret.local` and `web/.env.local`.

```bash
npm run setup              # once
npm run functions:watch    # terminal 1: recompile functions on save
npm run emulators:fresh    # terminal 2: first time (later: npm run emulators, which keeps your data)
npm run web                # terminal 3: http://localhost:5173
```

Open http://localhost:5173/admin and choose **Sign in with Google**. In the emulator popup, add a new account with email `host@example.com` (the `HOST_EMAIL` in `functions/.env.local`).
Emulator UI (inspect Firestore data and function logs): http://127.0.0.1:4000.

Google Calendar and Resend are real services even locally. Without keys in `functions/.secret.local`, bookings still work, but emails and Google connect only log errors. The reminder scheduler doesn't run in the emulator.

Tests for the slot engine: `npm --prefix functions test`.

## How double-booking is prevented
`POST /api/public/bookings` re-runs the slot calculation inside a Firestore transaction that reads the overlapping bookings. If another booking committed first, the transaction fails or the slot is gone, and the guest sees "that time was just taken".

## Notes and next ideas
- Expired `oauthStates` docs can be auto-deleted with a Firestore TTL policy on `createdAt`.
- Ideas for later: reschedule flow, custom booking questions, Firebase App Check (reCAPTCHA) on the booking endpoint, checking more calendars than `primary`, Stripe payments.
