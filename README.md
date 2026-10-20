# CICT Student Hub

A web app for the CICT department with two parts that share one login:

- **Review Board**: students upload and share reviewers (PDF or code/text files) and vote them up or down. Admins mark reviewers as verified and can remove them.
- **NFC door attendance**: event staff scan student ID cards at the door (check-in, temporary exit, re-entry). Scanning works **offline** and uploads when the phone is back online. Admins review everything in the Overview and the Door log.

Everything is **live**: open pages update by themselves (new door taps, votes, reviewers, accounts, card changes) without refreshing, within a few seconds by default and instantly with Neon Realtime switched on (see "Live updates").

There are three roles: **student**, **event staff** and **admin**. Students register themselves; the admin can also create staff and student accounts. Admin accounts cannot be created in the app: the only admin is the one made on first start from `ADMIN_ID` and `ADMIN_PASSWORD`.

## What each role sees

| Tab | Student | Event staff | Admin |
|---|:-:|:-:|:-:|
| Review board (browse, upload, vote) | yes | yes | yes, plus verify and delete |
| Card status (linked or not, tap to link your own card) | yes | yes | |
| Door scanner | | yes | |
| Overview (counts, things needing attention, recent door taps) | | | yes |
| Door log (every tap of a day, CSV export) | | | yes |
| ID cards (link or unlink a student's card) | | | yes |
| Users (create staff/student accounts, reset passwords, delete) | | | yes |

Admins land on **Overview**, staff land on **Door scanner**. Staff can read the student list (the scanner needs it to recognise cards) but cannot link or change cards.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18, Vite, Tailwind CSS 4 | Fast, simple, installable on phones |
| API | Express 4 running as a **Vercel serverless function** | One project and one URL: no CORS, no second host |
| Database | **PostgreSQL** (Neon, added from the Vercel Marketplace) | The data is relational and Postgres enforces uniqueness and valid values itself |
| File storage | **Vercel Blob (private store)** | PDFs do not belong in the database; files are only served after the login check |
| Auth | JWT (14 days) + bcrypt password hashes; students can also sign in by tapping their ID card on a phone they confirmed with their password | See "Card sign-in" |
| Offline | Service worker + `localStorage` queue | |
| Live updates | Change counters + polling, upgraded to push by **Neon Realtime** (optional, beta) | Works everywhere out of the box; instant where Realtime is available |

```
Browser / Android phone (React + service worker)
        |  same origin: /api/*
        v
Vercel Function  api/index.js  ->  server/app.js (Express)
        |                                   |
        v                                   v
   Neon Postgres                    Vercel Blob (private)
```

## Project structure

```
api/index.js        Vercel entry point (exports the Express app)
server/
  app.js            Express app, error handling
  dev.js            local development server (not used on Vercel)
  db.js             connection pool, transactions, first-run setup (tables + first admin)
  schema.js         the SQL tables
  storage.js        Vercel Blob (or database fallback) for uploaded files
  door.js           door-event queries shared by the attendance and admin routes
  throttle.js       login attempt limiter (stored in Postgres)
  devices.js        trusted phones for tap-only card sign-in
  live.js           change counters that power live updates
  realtime.js       optional Neon Realtime: seals the live query for browsers
  middleware/auth.js
  routes/           auth, users, students, attendance, resources, admin, live
src/
  pages/            Overview, ReviewBoard, DoorScanner, DoorLog, Cards, AdminUsers, Login
  components/       shared UI, CardStatus + CardLinkModal (card linked or not, link your own card), UpdateNotice (new-version banner)
  lib/              offline queue, door logic, liveStore.js (shared poller), live.js (React hooks)
public/sw.js        service worker
vite.config.js      build; writes /version.json and names the service-worker cache per deploy
vercel.json         Vercel settings
```

## Run it on your computer

You need Node.js 22+ and a Postgres database. The easiest is a free Neon database (https://neon.com): create a project and copy its connection string.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD
npm run dev:api             # terminal 1: API on http://localhost:5000
npm run dev                 # terminal 2: site on http://localhost:5173
```

The tables and the first admin account (`admin` + your `ADMIN_PASSWORD`) are created automatically on the first request. Uploaded files are stored in the database while running locally unless you set `BLOB_READ_WRITE_TOKEN`.

Testing NFC on a phone: Web NFC only works in Chrome on Android over HTTPS. Use the deployed site, or plug the phone in with USB debugging and run `adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` on the phone.

## Deploy to Vercel

1. Put the project on GitHub (`git init`, commit, push to a new repository).
2. On vercel.com choose **Add New, then Project**, import the repository, and keep the detected **Vite** preset. Add two environment variables before deploying:
   - `JWT_SECRET`: a long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `ADMIN_PASSWORD`: the password for the first admin account
3. Click **Deploy**.
4. Open the project's **Storage** tab. **Create Database**, pick **Neon** (Postgres), and connect it to the project. Vercel adds `DATABASE_URL` for you.
5. Still in **Storage**, create a **Blob** store with access set to **Private** and connect it to the project.
6. **Redeploy** (Deployments, the menu on the latest one, Redeploy). Environment variables only apply to new deployments.
7. Open `https://YOUR-SITE.vercel.app/api/health`. You should see `{"ok":true}`. If it shows an error message, it says what is missing.
8. Sign in at `https://YOUR-SITE.vercel.app` with ID `admin` and your `ADMIN_PASSWORD`.

Optional: in Project Settings under Functions, set the Function Region to Singapore (`sin1`), and choose a Singapore region for Neon, to cut latency for users in the Philippines.

### Environment variables

| Name | Where it comes from | Purpose |
|---|---|---|
| `DATABASE_URL` | Added by the Neon integration | Postgres connection |
| `JWT_SECRET` | You | Signs login tokens |
| `ADMIN_PASSWORD` | You | Password of the first admin (only used while no admin exists) |
| `ADMIN_ID` | You, optional (default `admin`) | Login ID of the first admin |
| `APP_UTC_OFFSET_HOURS` | You, optional (default `8`) | School time zone, used for "today" in the Overview and Door log |
| `BLOB_STORE_ID` / OIDC token | Added when a Blob store is connected | Private file storage |
| `BLOB_READ_WRITE_TOKEN` | Optional, for local development | Use Blob from your computer |
| `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` | Optional, from the Neon Console (Realtime page) | Instant updates by push (see "Live updates") |
| `NEON_REALTIME_DB` | Optional | Database name for Realtime if it differs from `DATABASE_URL` |

### Already deployed an earlier version?

The new version still runs on the same database. To remove what the old version left behind, run this once in the Neon SQL Editor (Neon dashboard, SQL Editor):

```sql
DROP TABLE IF EXISTS class_marks, class_sessions;
ALTER TABLE users DROP COLUMN IF EXISTS section;
DELETE FROM users WHERE role = 'teacher';
```

## Live updates

Two layers, and the second is optional:

**1. Change counters (always on).** Every write that other people's screens should notice (a vote, an upload, a door tap, a new account, a card link) bumps a counter in the `live_state` table, in the same transaction as the write. Pages ask `GET /api/live` for the counters, and when a counter moves only the pages that care re-fetch their data: the Overview and Door log follow `door`, `resources` and `users`; the Review Board follows `resources`; ID cards, Users and the Door scanner follow `users`. Without Realtime, pages ask every **3 seconds** while the tab is visible (about 1,200 tiny requests per hour per open tab; raise `FAST_MS` in `src/lib/liveStore.js` to save quota).

**2. Neon Realtime (optional, instant).** When `NEON_REALTIME_URL` and `NEON_REALTIME_SECRET` are set, `GET /api/live` also returns a *sealed query*: an encrypted, signed capability for exactly one statement, `SELECT topic, version FROM live_state ORDER BY topic`. The page opens one WebSocket to Neon, subscribes with it, and receives the new counters the moment a write commits. Then:

- Only the counters travel over that connection (no names, no files, no door taps). Real data is still fetched through the normal authenticated API, so every permission check stays where it was.
- Sealed queries last 60 seconds, so the page asks `/api/live` again about every 50 seconds to get a fresh one. That call also compares the counters (a safety net) and carries the build id.
- If Realtime is not configured, is not available in your Neon region, or ever drops, pages **fall back to 3-second polling automatically**, and go back to push when the connection is live again. Removing the two variables switches it off completely.
- Neon Realtime is in public beta and its SDK is `0.x`, so the package is pinned to `^0.1.1`.

### Turn on Neon Realtime

1. **Check the region.** Realtime is limited to certain Neon regions while in beta (when this was written: Singapore `aws-ap-southeast-1`, Frankfurt, N. Virginia and Ohio; the Neon Console and https://neon.com/docs/realtime/overview list the current ones). Neon Console, your project, **Settings** shows where your database is. If it is elsewhere, see "Not in a supported region" below.
2. **Open the Neon Console.** If you created the database through Vercel: project, **Storage** tab, click the database, **Open in Neon**.
3. In the Console choose your project, then **Postgres database**, then **Realtime**, then **Enable Realtime**. When it finishes the page shows `NEON_REALTIME_URL` and `NEON_REALTIME_SECRET`.
4. In Vercel, **Settings**, **Environment Variables**, add both (Production and Preview). Add `NEON_REALTIME_DB` only if your database is not the one named in `DATABASE_URL`.
5. **Redeploy.** Open the site, sign in, and open the browser's DevTools, Network tab, filter **WS**: you should see one open WebSocket, and `/api/live` calls only about once a minute.
6. To test: open the Overview in one window and tap a card (or vote on a reviewer) in another.

Running locally: put the same two variables in `.env` to try it; leave them out and the app simply polls.

**Not in a supported region?** Either stay on polling (nothing is lost), or create a new Neon database in a supported region (Vercel, Storage, Create Database, Neon, choose the region), connect it to the project in place of the old one, and redeploy. The tables and the first admin are created automatically, but data in the old database does not move.

### What you see

- **Card status** (sidebar, or the top bar on phones, for students and event staff): shows whether your ID card is linked, and changes by itself when an admin links it for you.
- **Voting** is instant: the card changes the moment you tap, and the vote is sent in the background (quick taps on one card are sent in order). If the server refuses it, the card goes back to what the server says and an error is shown.
- **Review Board**: other people's votes and the verified badge update in place without reordering the cards under you. Reviewers posted by other people appear behind a **"N new reviewers were posted"** banner with a **Show** button. A "new" reviewer is one that is not on screen, was posted after everything that is, and is not yours; nothing is guessed from clocks.
- **Overview and Door log**: numbers and rows update on their own; new rows flash briefly.
- **Door scanner**: each tap is uploaded about a second after it happens (so the admin sees it live). Offline it stays queued and uploads when the connection returns, and a failed upload is retried every 20 seconds.
- **New version**: the same call carries the deployed build id, so an open page shows "A new version is ready" with **Refresh** within seconds (up to about a minute with Realtime on). Nothing reloads by itself, so a scan in progress is never interrupted. `/version.json` is a backup check every minute.
- **Signed out remotely**: if an admin deletes your account, the page signs you out within seconds.

Updates stop while a tab is in the background and catch up the moment it is visible again.

## Animations

Small and cheap: pages and cards fade up (cards one after another), numbers pop when they change, new rows flash, banners slide in, progress rings animate, buttons press in, and the Review Board shows shimmering placeholders while it loads. Only `opacity` and `transform` are animated, every effect is under a third of a second (the flash is 1.6 seconds), and **all of it is turned off** for people whose device asks for reduced motion.

## User guide

- **Student**: register with Student ID (like `25-1167`), name, program, year and a password. Browse the Review Board, filter by program, year or course code, upload reviewers (up to 4 MB), and vote. The **Card linked / Card not linked** pill (sidebar, or the top bar on phones) shows whether your ID card is linked. Right after you register, a popup offers to link your card (or tap the pill any time): hold the ID to the back of the phone (or type the card ID), enter your password, and save. From then on, on that phone you can log out, choose **Tap ID card**, tap, and you are in with no password. On any other phone the first tap asks for your password once. A linked card can only be changed by an admin.
- **Event staff**: the same card status pill is shown for your own account. Staff can link a card too, but signing in with it always needs the password as well. *Door scanner* records taps at the entrance (check-in, temporary exit, re-entry) and shows who is inside. Taps upload automatically; if the connection drops, keep scanning and they upload when it returns (or use **Sync now**).
- **Admin**:
  - *Overview*: totals, what needs attention (students without a card, unregistered cards tapped today, no staff accounts), reviewers waiting for verification (verify or delete right there), and the latest door taps.
  - *Review board*: same as students, plus **Mark as verified** and **Delete** on every reviewer.
  - *Door log*: pick a day, filter by type of tap, and **Download CSV**.
  - *ID cards*: pick a student, tap their ID, save.
  - *Users*: create event staff and student accounts (not admins), reset passwords, delete accounts.

## API

All routes are under `/api` and, except register/login/health, need `Authorization: Bearer <token>`.

| Route | Who | What |
|---|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/nfc-login`; `GET /auth/me` | everyone | accounts and sign-in (6 wrong tries per IP and account locks for 10 minutes). `nfc-login` takes `{ token, deviceKey }` (students, trusted phone) or `{ token, password, deviceKey? }`; when a tap alone is not enough it answers `401` with `needPassword: true` |
| `GET/POST /users`, `PATCH /users/:id/password`, `DELETE /users/:id` | admin | account management |
| `POST /auth/card` | student, staff | link your own card: `{ "token", "password", "deviceKey" }`; refused if a card is already linked or the card belongs to someone else. For students it also trusts the phone for tap-only sign-in |
| `GET /students` | staff, admin | roster for the scanner |
| `PATCH /students/:id` | admin | link or remove an NFC card |
| `POST /attendance/sync` | staff | idempotent upload of door taps |
| `GET /attendance/venue-state` | staff, admin | who is inside or outside |
| `GET /attendance/log?date=YYYY-MM-DD` | admin | every door tap of a day |
| `GET /admin/overview` | admin | everything on the Overview page |
| `GET /live` | any signed-in user | change counters, deployed build id, server time and (when Realtime is on) a sealed live query |
| `GET/POST /resources`, `GET /resources/:id/file` | any signed-in user | review board |
| `POST /resources/:id/vote` | any signed-in user | `{ "value": 1 }` or `-1`; sending the same value again removes the vote. Answers with the updated reviewer. Votes on one reviewer are applied one at a time (the row is locked), so the score is always the sum of the votes |
| `POST /resources/:id/verify`, `DELETE /resources/:id` | admin | verify badge, remove a reviewer |

## Database

Tables are created automatically (see `server/schema.js`): `users`, `resources`, `resource_votes`, `files` (fallback storage only), `event_logs`, `card_devices`, `login_attempts`, `live_state`. Door taps carry a `client_id` generated on the phone, which is what makes re-sending safe.

## Card sign-in (tap without a password)

A card's serial number is **not a secret**: any NFC phone can read it, and the door scanner's roster (which every event staff phone downloads) contains all of them. So a tap alone is never accepted by the server. Tap-only sign-in works like this:

1. **Linking** (`POST /auth/card`): the student taps the card and confirms with their password. The server stores the card ID, and the browser creates a random 256-bit key (kept in `localStorage`, `cict_device`). Only its SHA-256 is stored, in `card_devices`.
2. **Signing in** (`POST /auth/nfc-login`): the browser sends the card ID **and** that key. Both must match the same student. Logging out does not delete the key.
3. **A phone the server does not know** (new phone, cleared browser data, key unused for 180 days) answers `needPassword`: the student enters the password once and that phone is trusted from then on. Unknown and known cards get the identical answer, so cards cannot be probed.

Rules built in: students only (staff and admins always need tap + password); at most 5 trusted phones per account (least recently used drops off); a wrong key counts toward the normal lockout while a missing key does not; **changing or removing a card, or resetting the password, signs every phone out of tap-only sign-in**; deleting the account removes them.

Not covered: someone with the unlocked phone, or who can read the browser's `localStorage`, can tap in. Anyone who can type a card ID can still try to link it first (the link needs only the account password), so an admin can fix a wrong link from the ID cards tab.

## Known limitations

- Uploads are limited to 4 MB because Vercel rejects larger request bodies.
- Login tokens are kept in `localStorage` (normal for a class project; a hardened version would use httpOnly cookies).
- Web NFC is Chrome on Android only.
- Without Neon Realtime, updates arrive within about 3 seconds (polling). Vercel functions cannot hold WebSockets open, which is why push comes from Neon's own Realtime service. It is a public beta (SDK `0.x`), limited to some regions, so it is optional and always falls back to polling.
- On free tiers the database sleeps after a few minutes idle; the first request afterwards takes about a second longer.
- "Inside now" on the Overview only counts taps made today, so students who never tapped out do not stay "inside" forever.

## Troubleshooting

- **`/api/health` says DATABASE_URL is missing**: connect the Neon database in the Storage tab, then redeploy.
- **Login says "Something went wrong"**: open the project's Logs in Vercel. A missing `JWT_SECRET` is reported by name.
- **Uploads fail on Vercel but work locally**: the Blob store is not connected (or not private). Connect it and redeploy.
- **Overview shows "today" for the wrong day**: set `APP_UTC_OFFSET_HOURS` to your time zone's offset from UTC.
- **Pages stop updating by themselves**: the page cannot reach `/api/live`. Check the connection and the Vercel logs; it reconnects by itself.
- **Updates still arrive every few seconds after enabling Realtime** (DevTools, Network, WS shows no open WebSocket): the page is polling. Check that both variables are set for the environment you are viewing and that you redeployed; confirm Realtime shows as enabled in the Neon Console; look in the Vercel logs for "Neon Realtime is unavailable". Polling keeps everything working in the meantime.
