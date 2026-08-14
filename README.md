# StaffTrack — QR Staff Availability System

A complete React + Supabase web app for tracking staff availability and location via QR check-in.

## Features by Role

### 👑 Admin
- Create staff accounts (email + password)
- Create student accounts (student ID login)
- View all users, edit roles, delete accounts
- Override any staff status and location
- Full activity log (realtime)
- Review any student submission (oversight)
- System settings

### 👤 Staff
- Login with email + password
- Update own availability (Available / In Meeting / Away / Offline)
- Set location and status note
- View personal QR code (for terminal scanning)
- Scan station QR codes with camera
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
2. Go to **SQL Editor** and run the full schema SQL from `src/lib/supabase.js` (it's in the comments at the bottom of the file). It creates the tables, the RLS policies, and the private `submissions` storage bucket.
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
│   └── supabase.js       # Client + full DB schema (SQL in comments)
├── pages/
│   ├── LoginPage.jsx
│   ├── DashboardPage.jsx  (all roles)
│   ├── staff/
│   │   ├── StaffProfilePage.jsx
│   │   ├── QRCheckInPage.jsx
│   │   ├── FacultySchedulePage.jsx
│   │   └── ThesisReviewPage.jsx    # review student submissions
│   ├── student/
│   │   ├── ScheduleRequestPage.jsx
│   │   └── ThesisSubmitPage.jsx    # submit PDF + track status
│   └── admin/
│       ├── AdminUsersPage.jsx
│       ├── AdminActivityPage.jsx
│       ├── AdminQRScanPage.jsx
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
