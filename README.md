# FacultyTrack — Faculty Presence & Academic Workflow System

A React + Supabase web app for Institute of Information Technology, Jahangirnagar University.
Tracks live faculty availability via QR check-in, and handles student meeting requests and
thesis/project submission review.

## Features by Role

### 👑 Admin
- Create staff accounts (email + password)
- Create student accounts (student ID login)
- View all users, edit roles, delete accounts
- Override any staff status and location
- **Location QR generator** — create a printable QR for any classroom, lab or office; faculty scan it to check in
- Full activity log (realtime)
- Review any student submission (oversight)
- System settings

### 👤 Staff
- Login with email + password
- Update own availability from a dedicated **Update Status** page — ten states
  (Available, In Class, In Lab, In Meeting, Busy, On Break, Away, Off Campus,
  On Leave, Offline) as one-tap tiles
- Set location and status note; signing out automatically sets you Offline
- Check in by scanning the printed QR posted in a room — one tap sets both status and location
- View own activity log
- Respond to student schedule requests
- Review submitted thesis / project PDFs — approve, deny, or edit the details and approve in one action
- Per-student submission activity log, with full revision history

### 🎓 Student
- Login with Student ID
- View real-time staff availability dashboard
- Filter by status, search by name or department
- Request a meeting with a faculty member
- Submit a thesis or project report as a PDF to a chosen faculty member
- Track review status, read faculty feedback, and resubmit if denied
- See own submission history, version by version

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full schema SQL from `src/lib/supabase.js` (it's in the comments at the bottom of the file). It creates the tables, the RLS policies, and the private `submissions` storage bucket. Then apply the files in `supabase/migrations/` — see [Migrations](#migrations) below.
3. Enable **Realtime** for `staff_status`, `activity_log`, `schedule_requests`, `thesis_submissions` and `notifications` in the Supabase dashboard (the schema SQL also does this via `ALTER PUBLICATION`)
4. Create a public `avatars` bucket for profile photos (Storage → New bucket → public)

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. Create first Admin user
In your Supabase dashboard → **Authentication → Users → Invite user**:
- Email: your admin email
- In **User Metadata**, add: `{ "full_name": "Admin Name", "role": "admin" }`

### 5. Run the app
```bash
npm run dev
```

---

## Project Structure

```
src/
├── components/
│   ├── ui/           # StatusBadge, Avatar, Modal, StatCard, etc.
│   ├── layout/       # AppLayout (sidebar + topbar)
│   └── shared/       # RouteGuard (auth + role protection)
├── context/
│   └── AuthContext.jsx   # Session, profile, role, signIn/Out
├── hooks/
│   └── useData.js        # All Supabase queries + realtime hooks
├── lib/
│   ├── supabase.js       # Client + full DB schema (SQL in comments)
│   └── staffStatus.js    # Status values + the verified staff_status writer
├── pages/
│   ├── LoginPage.jsx
│   ├── DashboardPage.jsx  (all roles)
│   ├── staff/
│   │   ├── StaffProfilePage.jsx
│   │   ├── StatusUpdatePage.jsx     # the ten-state status picker
│   │   ├── QRCheckInPage.jsx
│   │   ├── FacultySchedulePage.jsx
│   │   └── ThesisReviewPage.jsx    # review student submissions
│   ├── student/
│   │   ├── ScheduleRequestPage.jsx
│   │   └── ThesisSubmitPage.jsx    # submit PDF + track status
│   └── admin/
│       ├── AdminUsersPage.jsx
│       ├── AdminActivityPage.jsx
│       ├── AdminLocationQRPage.jsx  # generate + print room QR codes
│       └── AdminSettingsPage.jsx
├── App.jsx
├── AppRouter.jsx
└── main.jsx
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extends auth.users — stores name, role, department |
| `staff_status` | One row per staff — status, location, note, timestamp |
| `activity_log` | Append-only log of all check-ins and status changes |
| `schedule_requests` | Student meeting requests and the faculty response |
| `thesis_submissions` | Thesis / project PDFs, one row per version, plus review outcome |
| `locations` | Rooms that have a printed QR check-in code |
| `notifications` | Per-user in-app notifications for both flows |

### Storage buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `avatars` | yes | Profile photos, served via public URL |
| `submissions` | **no** | Thesis / project PDFs — private, 15 MB cap, `application/pdf` only, served through short-lived signed URLs |

---

## Submission Review Workflow

A student submits a PDF to one specific faculty member. Only that faculty
member (and an admin) can see or act on it.

```
submitted ──▶ under_review ──▶ approved   (or "Edit & Approve")
                   │
                   └──▶ denied ──▶ student resubmits as v2 ──▶ …
```

A resubmission is a **new row**, never an edit — version 2+ rows point at the
first row of their chain via `parent_id`, so the whole revision history stays
intact and is visible to both the student and the faculty member.

Row-Level Security enforces the rules in the database, not just the UI:
- students may `INSERT` only in their own name, and may **not** `UPDATE` — so a
  student cannot approve or re-grade their own work
- only the assigned faculty member (or an admin) may `UPDATE` a submission, and
  the `WITH CHECK` clause stops a reviewer reassigning one to someone else
- storage policies allow a PDF to be read only by its owner, the faculty member
  it was submitted to, and admins
- nothing about a submission is written to `activity_log`, whose SELECT policy is
  `USING (true)` — a title there would be readable by every signed-in user

> **Applying this to an existing database:** run
> `supabase/migrations/20260814_thesis_submissions.sql` in the SQL Editor. It is
> purely additive — it creates the new table, bucket and policies, adds one
> nullable column to `notifications`, and modifies no existing policy or row.

---

## Migrations

`supabase/migrations/` holds the SQL to apply to an existing database, in this
order. Each file is idempotent and ends with a verification query whose output
should read `OK`.

| File | What it does | Required? |
|------|--------------|-----------|
| `20260814_thesis_submissions.sql` | Creates `thesis_submissions`, the private `submissions` bucket and their policies. Purely additive. | Yes — the submission pages need it |
| `20260814b_fix_policy_recursion.sql` | Moves policy lookups into `SECURITY DEFINER` helpers. Without it, reading `thesis_submissions` raises `42P17: infinite recursion`. | Yes |
| `20260815_widen_staff_status_check.sql` | Widens the `staff_status.status` CHECK from 4 values to all 10, and sets `REPLICA IDENTITY FULL`. Without it, six statuses fail to save. | Yes |
| `20260814_fix_profile_role_escalation.sql` | Stops any signed-in user rewriting their own `profiles.role` to `admin`. | Strongly recommended |
| `20260818_locations.sql` | Creates the `locations` registry so room QR codes can be edited and retired after printing. Purely additive. | Yes - the Location QR page needs it |

`supabase/backup_snapshot.sql` is a read-only snapshot query for taking a manual
backup before applying any of the above.

### Known limitation

Student accounts are provisioned with the Student ID as the initial password for
fast classroom onboarding. A forced password change on first login, or
university SSO, is the intended next step — see Future Scope in the proposal.

---

## Tech Stack

- **React 18** + **Vite**
- **React Router v6** — client-side routing
- **Supabase** — auth, database, realtime subscriptions
- **Tailwind CSS** — styling
- **qrcode.react** — QR code generation
- **html5-qrcode** — QR code scanning via camera
- **date-fns** — date formatting
- **react-hot-toast** — notifications

---

## Check-In by Location QR

An admin generates a QR for a room on **Location QR**, prints it, and posts it
inside. Each code encodes a link back into the app:

```
https://<your-app>/app/staff/checkin?loc=Class%20Room%20310&st=in-class
```

A lecturer points their phone camera at it, taps the link, confirms once, and
their status and location update together — a classroom sets **In Class**, a lab
sets **In Lab**, an office sets **Available**. Because the code holds a link
rather than data, the phone's native camera opens it; there is no in-app scanner
to find first. Scanning while signed out returns to that room's check-in after
login.

Rooms live in the **`locations`** table, and a code encodes the row's **id**
rather than its name. That is what makes a printed sheet manageable after it is
on the wall: renaming a room, or changing the status it sets, takes effect on
every sheet already posted, and retiring or deleting a room stops those sheets
working. Admins can create, edit, retire and delete rooms from the Location QR
page.

Codes printed before the registry existed encoded the name and status directly
(`?loc=&st=`). Those are still accepted at check-in so old sheets keep working,
but their values cannot be managed centrally.

> **This is a convenience, not attendance proof.** A printed code can be
> photographed and the URL can be edited by hand, so a check-in is a claim of
> presence rather than evidence of it. That is no weaker than the status picker,
> which already lets faculty set any status directly. Verified attendance would
> need per-room rotating tokens — see Future Scope.

---

## Supabase Realtime

The dashboard automatically updates when any staff member changes their status — no page refresh needed. Subscriptions are set up on:
- `staff_status` — for the dashboard and staff list
- `activity_log` — for the admin activity feed

---

## Deploying

```bash
npm run build
```
Deploy the `dist/` folder to Vercel, Netlify, or any static host.

Set environment variables on your hosting platform (same as `.env`).
