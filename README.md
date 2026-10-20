# CICT Student Hub

A web app for the CICT department with two parts that share one login:

- **Review Board**: students upload and share reviewers (PDF or code/text files) and vote them up or down. Admins mark reviewers as verified and can remove them.
- **NFC door attendance**: event staff scan student ID cards at the door (check-in, temporary exit, re-entry). Scanning works **offline** and uploads when the phone is back online. Admins review everything in the Overview and the Door log.

Everything is **live**: open pages update by themselves within a few seconds (new door taps, votes, reviewers, accounts, card changes) without refreshing.

There are three roles: **student**, **event staff** and **admin**. Students register themselves; the admin creates staff and admin accounts.

## What each role sees

| Tab | Student | Event staff | Admin |
|---|:-:|:-:|:-:|
| Review board (browse, upload, vote) | yes | yes | yes, plus verify and delete |
| Door scanner | | yes | |
| Overview (counts, things needing attention, recent door taps) | | | yes |
| Door log (every tap of a day, CSV export) | | | yes |
| ID cards (link or unlink a student's card) | | | yes |
| Users (create staff/admin accounts, reset passwords, delete) | | | yes |

Admins land on **Overview**, staff land on **Door scanner**. Staff can read the student list (the scanner needs it to recognise cards) but cannot link or change cards.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18, Vite, Tailwind CSS 4 | Fast, simple, installable on phones |
| API | Express 4 running as a **Vercel serverless function** | One project and one URL: no CORS, no second host |
| Database | **PostgreSQL** (Neon, added from the Vercel Marketplace) | The data is relational and Postgres enforces uniqueness and valid values itself |
| File storage | **Vercel Blob (private store)** | PDFs do not belong in the database; files are only served after the login check |
| Auth | JWT (14 days) + bcrypt password hashes | |
| Offline | Service worker + `localStorage` queue | |

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
  live.js           change counters that power live updates
  middleware/auth.js
  routes/           auth, users, students, attendance, resources, admin, live
src/
  pages/            Overview, ReviewBoard, DoorScanner, DoorLog, Cards, AdminUsers, Login
  components/       shared UI, LiveBadge, UpdateNotice (new-version banner)
  lib/              offline queue, door logic, liveStore.js (shared poller), live.js (React hooks)
public/sw.js        service worker
vite.config.js      build; writes /version.json and names the service-worker cache per deploy
vercel.json         Vercel settings
```

## Run it on your computer

You need Node.js 20+ and a Postgres database. The easiest is a free Neon database (https://neon.com): create a project and copy its connection string.

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

### Already deployed an earlier version?

The new version still runs on the same database. To remove what the old version left behind, run this once in the Neon SQL Editor (Neon dashboard, SQL Editor):

```sql
DROP TABLE IF EXISTS class_marks, class_sessions;
ALTER TABLE users DROP COLUMN IF EXISTS section;
DELETE FROM users WHERE role = 'teacher';
```

## Live updates

Vercel functions cannot hold a WebSocket open, so live updates use a small **change feed** instead:

1. Every write that other people's screens should notice (a vote, an upload, a door tap, a new account, a card link) bumps a counter in the `live_state` table, in the same transaction as the write.
2. Every signed-in page asks `GET /api/live` every **3 seconds** while the tab is visible. The answer is a few bytes: `{ topics: { resources: 12, door: 40, users: 5 }, build: "..." }`. One shared poller serves the whole app.
3. When a counter moves, only the pages that care re-fetch their data: the Overview and Door log follow `door`, `resources` and `users`; the Review Board follows `resources`; ID cards, Users and the Door scanner follow `users`.

What you see:

- **Live badge** (sidebar, or the top bar on phones): green "Live" while connected, amber "Reconnecting" when the server cannot be reached. It recovers by itself.
- **Review Board**: other people's votes and the verified badge update in place without reordering the cards under you. Reviewers posted by other people appear behind a **"N new reviewers were posted"** banner with a **Show** button. A "new" reviewer is one that is not on screen, was posted after everything that is, and is not yours; nothing is guessed from clocks.
- **Overview and Door log**: numbers and rows update on their own; new rows flash briefly.
- **Door scanner**: each tap is uploaded about a second after it happens (so the admin sees it live). Offline it stays queued and uploads when the connection returns, and a failed upload is retried every 20 seconds.
- **New version**: the feed also carries the deployed build id, so a page that is open learns about a new deploy within seconds and shows "A new version is ready" with **Refresh**. Nothing reloads by itself, so a scan in progress is never interrupted. `/version.json` is a backup check every minute.
- **Signed out remotely**: if an admin deletes your account, the page signs you out within seconds.

Polling pauses while a tab is in the background and checks immediately when it comes back. Cost: one tiny request every 3 seconds per open, visible tab (about 1,200 per hour). If you ever need to save quota, raise `FAST_MS` in `src/lib/liveStore.js` (for example to `5000`).

## Animations

Small and cheap: pages and cards fade up (cards one after another), numbers pop when they change, new rows flash, banners slide in, progress rings animate, buttons press in, and the Review Board shows shimmering placeholders while it loads. Only `opacity` and `transform` are animated, every effect is under a third of a second (the flash is 1.6 seconds), and **all of it is turned off** for people whose device asks for reduced motion.

## User guide

- **Student**: register with Student ID (like `25-1167`), name, program, year and a password. Browse the Review Board, filter by program, year or course code, upload reviewers (up to 4 MB), and vote. If an admin linked your ID card, you can also sign in by tapping the card and entering your password.
- **Event staff**: *Door scanner* records taps at the entrance (check-in, temporary exit, re-entry) and shows who is inside. Taps upload automatically; if the connection drops, keep scanning and they upload when it returns (or use **Sync now**).
- **Admin**:
  - *Overview*: totals, what needs attention (students without a card, unregistered cards tapped today, no staff accounts), reviewers waiting for verification (verify or delete right there), and the latest door taps.
  - *Review board*: same as students, plus **Mark as verified** and **Delete** on every reviewer.
  - *Door log*: pick a day, filter by type of tap, and **Download CSV**.
  - *ID cards*: pick a student, tap their ID, save.
  - *Users*: create event staff and admin accounts, reset passwords, delete accounts.

## API

All routes are under `/api` and, except register/login/health, need `Authorization: Bearer <token>`.

| Route | Who | What |
|---|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/nfc-login`; `GET /auth/me` | everyone | accounts and sign-in (6 wrong tries per IP and account locks for 10 minutes) |
| `GET/POST /users`, `PATCH /users/:id/password`, `DELETE /users/:id` | admin | account management |
| `GET /students` | staff, admin | roster for the scanner |
| `PATCH /students/:id` | admin | link or remove an NFC card |
| `POST /attendance/sync` | staff | idempotent upload of door taps |
| `GET /attendance/venue-state` | staff, admin | who is inside or outside |
| `GET /attendance/log?date=YYYY-MM-DD` | admin | every door tap of a day |
| `GET /admin/overview` | admin | everything on the Overview page |
| `GET /live` | any signed-in user | change counters + deployed build id (powers live updates) |
| `GET/POST /resources`, `GET /resources/:id/file` | any signed-in user | review board |
| `POST /resources/:id/vote` | any signed-in user | `{ "value": 1 }` or `-1`; sending the same value again removes the vote |
| `POST /resources/:id/verify`, `DELETE /resources/:id` | admin | verify badge, remove a reviewer |

## Database

Tables are created automatically (see `server/schema.js`): `users`, `resources`, `resource_votes`, `files` (fallback storage only), `event_logs`, `login_attempts`, `live_state`. Door taps carry a `client_id` generated on the phone, which is what makes re-sending safe.

## Known limitations

- Uploads are limited to 4 MB because Vercel rejects larger request bodies.
- Login tokens are kept in `localStorage` (normal for a class project; a hardened version would use httpOnly cookies).
- Web NFC is Chrome on Android only.
- Updates arrive within about 3 seconds (polling), not instantly. True push would need a separate service such as Pusher or Ably, because Vercel functions cannot keep WebSockets open.
- On free tiers the database sleeps after a few minutes idle; the first request afterwards takes about a second longer.
- "Inside now" on the Overview only counts taps made today, so students who never tapped out do not stay "inside" forever.

## Troubleshooting

- **`/api/health` says DATABASE_URL is missing**: connect the Neon database in the Storage tab, then redeploy.
- **Login says "Something went wrong"**: open the project's Logs in Vercel. A missing `JWT_SECRET` is reported by name.
- **Uploads fail on Vercel but work locally**: the Blob store is not connected (or not private). Connect it and redeploy.
- **Overview shows "today" for the wrong day**: set `APP_UTC_OFFSET_HOURS` to your time zone's offset from UTC.
- **The Live badge stays amber**: the page cannot reach `/api/live`. Check the connection and the Vercel logs; it reconnects by itself.
