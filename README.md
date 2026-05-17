# StaffTrack — QR Staff Availability System

A complete React + Supabase web app for tracking staff availability and location via QR check-in.

## Features by Role

### 👑 Admin
- Create staff accounts (email + password)
- Create student accounts (student ID login)
- View all users, edit roles, delete accounts
- Override any staff status and location
- Full activity log (realtime)
- System settings

### 👤 Staff
- Login with email + password
- Update own availability (Available / In Meeting / Away / Offline)
- Set location and status note
- View personal QR code (for terminal scanning)
- Scan station QR codes with camera
- View own activity log

### 🎓 Student
- Login with Student ID
- View real-time staff availability dashboard
- Filter by status, search by name or department

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full schema SQL from `src/lib/supabase.js` (it's in the comments at the bottom of the file)
3. Enable **Realtime** for `staff_status` and `activity_log` tables in Supabase dashboard

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
│   │   └── QRCheckInPage.jsx
│   └── admin/
│       ├── AdminUsersPage.jsx
│       ├── AdminActivityPage.jsx
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
