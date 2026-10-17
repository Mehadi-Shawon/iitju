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
- Post announcements on any topic to all students, or to one of your
  classrooms; edit or delete them afterwards
- Classrooms: your own named groups of students (e.g. a thesis group), each
  with a group chat, the files every student has submitted, and a log of each
  submit and update

### 🎓 Student
- Login with Student ID
- View real-time staff availability dashboard
- Filter by status, search by name or department
- Request a meeting with a faculty member
- Submit a thesis or project report as a PDF to a chosen faculty member
- Track review status, read faculty feedback, and resubmit if denied
- See own submission history, version by version
- Read announcements from faculty — those for all students and for any
  classroom you are in — with a notification for each new one
- My Classes: chat with the class and teacher, submit work files and update
  them with new versions, and see your own submission log

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full schema SQL from `src/lib/supabase.js` (it's in the comments at the bottom of the file). It creates the tables, the RLS policies, and the private `submissions` storage bucket. Then apply the files in `supabase/migrations/` — see [Migrations](#migrations) below.
3. Enable **Realtime** for `staff_status`, `activity_log`, `schedule_requests`, `thesis_submissions`, `announcements`, `class_messages`, `class_files` and `notifications` in the Supabase dashboard (the schema SQL also does this via `ALTER PUBLICATION`)
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
│   └── shared/       # RouteGuard (auth + role protection), AnnouncementInbox (list + reading pane, both roles)
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
│   ├── ClassroomPage.jsx  (faculty + students: chat, work, log)
│   ├── staff/
│   │   ├── StaffProfilePage.jsx
│   │   ├── StatusUpdatePage.jsx     # the ten-state status picker
│   │   ├── QRCheckInPage.jsx
│   │   ├── FacultySchedulePage.jsx
│   │   ├── ThesisReviewPage.jsx    # review student submissions
│   │   ├── FacultyAnnouncementsPage.jsx  # post announcements
│   │   └── ClassroomsPage.jsx      # create and edit classrooms
│   ├── student/
│   │   ├── ScheduleRequestPage.jsx
│   │   ├── ThesisSubmitPage.jsx    # submit PDF + track status
│   │   ├── StudentAnnouncementsPage.jsx  # read announcements
│   │   └── MyClassesPage.jsx       # the classrooms you are in
│   └── admin/
│       ├── AdminUsersPage.jsx
│       ├── AdminActivityPage.jsx
│       ├── AdminLocationQRPage.jsx  # generate + print room QR codes
│       └── AdminSettingsPage.jsx
├── App.jsx
├── AppRouter.jsx
└── main.jsx

android/                  # the Android app (Capacitor's native project)
assets/                   # source images for the app icon and splash screen
capacitor.config.json     # app id, name, and where the web build lives
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
| `announcements` | Faculty notices — topic, message, and who it was sent to |
| `announcement_groups` | Each faculty member's classrooms — their own named sets of students |
| `announcement_group_members` | Which students are in each classroom |
| `class_messages` | Classroom chat messages |
| `class_files` | Work submitted in a classroom, one row per version — this is the submission log |
| `notifications` | Per-user in-app notifications for every flow |

### Storage buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `avatars` | yes | Profile photos, served via public URL |
| `submissions` | **no** | Thesis / project PDFs — private, 15 MB cap, `application/pdf` only, served through short-lived signed URLs |
| `class-files` | **no** | Classroom work — private, 15 MB cap, PDF, Word, PowerPoint, Excel, images or ZIP, served through short-lived signed URLs |

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

## Announcements

A faculty member posts an announcement (a topic and a message) to **all
students**, or to **one of their classrooms** (see below).

- every recipient gets an in-app notification, written by a database trigger
  in the same transaction as the post
- the author can edit the topic and message later (students see it marked
  *edited* and are not notified again) or delete it, which also removes its
  notifications
- who a post was sent to cannot change after posting, and deleting a
  classroom deletes the announcements sent to it
- membership is live: a student added to a classroom sees its earlier
  announcements, and a student removed from it stops seeing them

Row-Level Security enforces this in the database: only faculty can post, only
to their own classrooms, and a student can read only the posts for all
students plus those for classrooms they belong to. Admins neither post nor
read announcements.

---

## Classrooms

A classroom is a named set of students that a faculty member puts together
on the **Classrooms** page — a course section, a lab group, a thesis team —
and it is private to them. (In the database these are the
`announcement_groups`, since announcements came first.) Students see the
classrooms they are in under **My Classes**. Inside one:

- **Chat** — the teacher and every student in the classroom can write. Text
  only; messages cannot be edited or deleted, and they send no notifications.
- **Work** — a student submits a file and can later update it with a new
  version. Only that student and the teacher can see it, never classmates.
- **Log** — every submit and update with its time. The teacher sees every
  student's; a student sees their own.

The log is not a separate table anyone writes to: every upload is its own
row in `class_files`, version 1 is the submission and later versions are
updates. No student can change or delete one, in the table or in the
bucket, so the log cannot be edited or drift from the files. The teacher gets
a notification for each submit and update.

Row-Level Security enforces this in the database, not just the UI:
- only a student of the classroom can upload, into their own folder of it
  (`{classroom}/{student}/…`), and the row must point at that folder — so no
  one can pass off a classmate's file as theirs
- the version number is worked out by a trigger, not trusted from the client,
  and an update must extend the student's own submission
- there is no `UPDATE` policy on the bucket, so an upload can never overwrite
  submitted work
- deleting a classroom deletes its chat, file records and announcements; the
  app removes its stored files from the bucket first, since those are not rows
- a student removed from a classroom loses its chat, but the work they
  already submitted stays on record for the teacher

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
| `20261017_announcements.sql` | Creates `announcements`, `announcement_groups` and `announcement_group_members` with their policies and notification triggers, and adds `notifications.announcement_id`. Purely additive. | Yes - the Announcements and Classrooms pages need it |
| `20261017b_classrooms.sql` | Creates `class_messages`, `class_files` and the private `class-files` bucket with their policies and triggers, and adds `notifications.group_id`. Needs the announcements file first, and refuses to run without it. Purely additive. | Yes - the Classrooms pages need it |

`supabase/backup_snapshot.sql` is a read-only snapshot query for taking a manual
backup before applying any of the above.

`supabase/anonymize_faculty.sql` replaces real faculty names, titles and photos
with made-up ones ("Faculty Member 01", …). Faculty may not be shown by real
name or photo without their consent. Logins are unchanged; the file explains
what it touches. Take a backup first, and afterwards delete the photo files it
lists from Storage.

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
- **Capacitor 8** — packages the web app as the Android app
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

---

## Android App

The same app also runs as an Android app, built with
[Capacitor](https://capacitorjs.com). The web build is bundled inside a native
Android project in `android/`, and the app talks to the same Supabase project
as the website. A change to the web app reaches the Android app the next time
the APK is rebuilt.

### Building the APK

Needs Java 21 and the Android SDK with platform 36. Then:

```bash
npm run android:apk
```

The installable file is written to
`android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a phone and
open it; Android asks once to allow installs from that source. This is a debug
build, fine for installing directly. Publishing on Google Play needs a signed
release build instead.

`npm run android:sync` only copies a fresh web build into `android/`, for
working on the project in Android Studio.

### Trying it on the emulator

```bash
npm run android:run        # build the latest code, open the emulator, install and start the app
npm run android:emulator   # just open the emulator
```

Both expect an Android Virtual Device named `facultytrack_test` (Android 16).
Create one in Android Studio's Device Manager, or with `avdmanager`. Turn on
`hw.keyboard=yes` in its `config.ini` so the computer's keyboard types into
it. Closing the emulator window shuts it down, and the next start resumes from
where it was. Its camera shows a virtual room, so the Check In scanner has no
real code to read there.

### What is different inside the app

- PDFs and submitted files open in the phone's browser rather than inside the
  app.
- Room QR codes made inside the app must point at the website, so set
  `VITE_PUBLIC_SITE_URL` in `.env` before building. Without it, the Location QR
  page asks admins to print codes from the website.
- Scanning a printed room code with the phone's own camera app opens the
  website. The app's **Check In** page has its own scanner.
- The icon and splash screen are generated from the images in `assets/` with
  `npx @capacitor/assets generate --android`.
