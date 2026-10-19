# CICT Student Hub

A web app for the CICT department with two parts that share one login:

- **Review Board**: students upload and share reviewers (PDF or code/text files), vote them up or down, and teachers mark them as verified.
- **NFC Attendance**: staff scan student ID cards at the door (check-in, temporary exit, re-entry) and teachers take class attendance with taps. Scanning works **offline** and uploads when the phone is back online.

Roles: `student`, `teacher`, `staff`, `admin`. Students register themselves; the admin creates teacher and staff accounts.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18, Vite, Tailwind CSS 4 | Unchanged from the original project |
| API | Express 4 running as a **Vercel serverless function** | One project and one URL: no CORS, no second host, no cold-sleeping free server |
| Database | **PostgreSQL** (Neon, added from the Vercel Marketplace) | The data is relational (users, sessions, marks, votes) and Postgres enforces uniqueness and valid values in the database itself |
| File storage | **Vercel Blob (private store)** | PDFs do not belong in the database. Files are never public: they are only served after the login check |
| Auth | JWT (14 days) + bcrypt password hashes | Same behaviour as before |
| Offline | Service worker + `localStorage` queue | Same behaviour as before |

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
  throttle.js       login attempt limiter (stored in Postgres)
  middleware/auth.js
  routes/           auth, users, students, attendance, resources
src/                React app (pages, components, offline queue)
public/sw.js        service worker
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
| `BLOB_STORE_ID` / OIDC token | Added when a Blob store is connected | Private file storage |
| `BLOB_READ_WRITE_TOKEN` | Optional, for local development | Use Blob from your computer |

## User guide

- **Student**: register with Student ID (like `25-1167`), name, program, year and a password. Browse the Review Board, filter by program, year or course code, upload reviewers (up to 4 MB), and vote. If your ID card was linked, you can also sign in by tapping the card and entering your password.
- **Staff**: *Door Scanner* records taps at the entrance (check-in, temporary exit, re-entry). *ID Cards* links a card to a student by tapping it.
- **Teacher**: *Class Attendance* starts a session for a course, marks students present or late with card taps (or manually: excused, absent), and exports a CSV report. Teachers can also mark reviewers as verified.
- **Admin**: *Accounts* creates teacher, staff and admin accounts, resets passwords and deletes accounts. Admins can do everything staff and teachers can.
- **Offline**: scans are saved on the phone and uploaded when the connection returns ("Sync" bar). Sending the same data twice never creates duplicates.

## API

All routes are under `/api` and, except register/login/health, need `Authorization: Bearer <token>`.

| Route | Who | What |
|---|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/nfc-login`; `GET /auth/me` | everyone | accounts and sign-in (6 wrong tries per IP and account locks for 10 minutes) |
| `GET/POST /users`, `PATCH /users/:id/password`, `DELETE /users/:id` | admin | account management |
| `GET /students`, `PATCH /students/:id` | staff, teacher, admin | roster, link or remove an NFC card, set section |
| `POST /attendance/sync` | staff (door taps), teacher (sessions and marks), admin | idempotent upload from a phone |
| `GET /attendance/venue-state` | staff, admin | who is inside or outside |
| `GET /attendance/sessions`, `GET /attendance/sessions/:clientId` | teacher, admin | class sessions and their marks |
| `GET/POST /resources`, `GET /resources/:id/file` | any signed-in user | review board |
| `POST /resources/:id/vote` | any signed-in user | `{ "value": 1 }` or `-1`; sending the same value again removes the vote |
| `POST /resources/:id/verify` | teacher, admin | toggle the verified badge |

## Database

Tables are created automatically (see `server/schema.js`): `users`, `resources`, `resource_votes`, `files` (fallback storage only), `event_logs`, `class_sessions`, `class_marks`, `login_attempts`. Door taps, sessions and marks carry a `client_id` generated on the phone, which is what makes re-sending safe.

## Known limitations

- Uploads are limited to 4 MB because Vercel rejects larger request bodies.
- Login tokens are kept in `localStorage` (normal for a class project; a hardened version would use httpOnly cookies).
- Web NFC is Chrome on Android only.
- On free tiers the database sleeps after a few minutes idle; the first request afterwards takes about a second longer.

## Troubleshooting

- **`/api/health` says DATABASE_URL is missing**: connect the Neon database in the Storage tab, then redeploy.
- **Login says "Something went wrong"**: open the project's Logs in Vercel. A missing `JWT_SECRET` is reported by name.
- **Uploads fail on Vercel but work locally**: the Blob store is not connected (or not private). Connect it and redeploy.
- **Phones show an old version after a deploy**: change `CACHE` in `public/sw.js` (for example `cict-shell-v4`) before deploying.
