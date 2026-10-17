import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, anonClient } from '@/lib/supabase'
import { writeStaffStatus, ABSENT_STATUSES } from '@/lib/staffStatus'
import { useAuth } from '@/context/AuthContext'

// Every subscription needs a channel name of its own. supabase.channel() hands
// back the existing channel when a name is reused, and adding listeners to one
// that is already subscribed throws — which `${prefix}-${Date.now()}` allowed
// whenever two subscriptions started in the same millisecond, as the sidebar's
// notification bell and a page's own do when they mount together. The counter
// makes names unique; Date.now() keeps them unique across a dev hot reload,
// which restarts the counter.
let channelCount = 0
const channelName = prefix => `${prefix}-${++channelCount}-${Date.now()}`

// ── Staff list with their status (realtime) ──────────────────
export function useStaffList() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStaff = useCallback(async () => {
    try {
      // Two separate queries so a staff_status problem never hides the staff list
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'staff')
        .order('full_name')

      if (profilesError) { setError(profilesError); return }

      // Fetch all statuses; if this fails, staff still show as offline
      const { data: statuses } = await supabase
        .from('staff_status')
        .select('staff_id, status, location, note, updated_at')

      // Build a map: staff_id → latest status row
      const statusMap = {}
      for (const row of statuses ?? []) {
        const prev = statusMap[row.staff_id]
        if (!prev || (row.updated_at ?? '') > (prev.updated_at ?? '')) {
          statusMap[row.staff_id] = row
        }
      }

      setStaff((profiles ?? []).map(p => {
        const st = statusMap[p.id]
        return {
          ...p,
          status: st?.status ?? 'offline',
          location: st?.location ?? '',
          note: st?.note ?? '',
          updated_at: st?.updated_at ?? null,
        }
      }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStaff()

    // staff_status UPDATE events need REPLICA IDENTITY FULL to pass RLS checks in Supabase
    // Realtime. As a reliable fallback, we also watch activity_log INSERT events — every
    // successful updateStatus/checkInViaQR call inserts one — to trigger a full refetch.
    const channel = supabase
      .channel(channelName('staff-watcher'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_status' }, fetchStaff)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, fetchStaff)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, fetchStaff)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchStaff])

  return { staff, loading, error, refetch: fetchStaff }
}

// ── Own staff status ─────────────────────────────────────────
export function useMyStatus() {
  const { profile } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    if (!profile?.id) return
    const { data: rows } = await supabase
      .from('staff_status')
      .select('*')
      .eq('staff_id', profile.id)
      .order('updated_at', { ascending: false })
      .limit(1)
    setStatus(rows?.[0] ?? null)
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function updateStatus({ status: newStatus, location, note }) {
    // writeStaffStatus verifies the row count and creates the row if missing —
    // a bare .update() reports success even when it writes nothing
    const { error } = await writeStaffStatus(profile.id, {
      status: newStatus,
      location,
      note,
    })
    if (error) return { error }

    const { error: logError } = await supabase.from('activity_log').insert({
      staff_id: profile.id,
      action: 'status_update',
      detail: `Status set to ${newStatus}${location ? ' · ' + location : ''}`,
    })
    if (logError) console.error('activity_log insert failed:', logError)

    await fetchStatus()
    return { error: null }
  }

  // Called when a faculty member scans the QR posted in a room. The scanned
  // location decides both where they are and what they are doing, which is the
  // whole point — one scan replaces the ten-status picker plus a location field.
  //
  // Deliberately does NOT fall back to the previous location: a check-in only
  // tells us someone is present, and republishing yesterday's room with a fresh
  // timestamp makes a wrong location look freshly confirmed. The note is cleared
  // for the same reason rather than overwritten with boilerplate.
  async function checkInViaQR({ location = '', status: newStatus = 'available' } = {}) {
    const { error } = await writeStaffStatus(profile.id, {
      status: newStatus,
      location,
      note: '',
    })
    if (error) return { error }

    await supabase.from('activity_log').insert({
      staff_id: profile.id,
      action: 'qr_checkin',
      detail: `Checked in via QR${location ? ` at ${location}` : ''} · ${newStatus}`,
    })
    await fetchStatus()
    return { error: null }
  }

  return { status, loading, updateStatus, checkInViaQR, refetch: fetchStatus }
}

// ── Activity log ─────────────────────────────────────────────
export function useActivityLog(staffId, limit = 20) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staffId) return
    let mounted = true

    async function fetch() {
      // No join — keeps query simple and avoids permission failures on profiles
      let q = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (staffId !== 'all') q = q.eq('staff_id', staffId)

      const { data } = await q
      if (!mounted) return
      if (data) setLogs(data)
      setLoading(false)    // always clear loading regardless of result
    }

    fetch()
    const poll = setInterval(fetch, 5_000)

    return () => {
      mounted = false
      clearInterval(poll)
    }
  }, [staffId, limit])

  return { logs, loading, refetch: () => setLoading(true) }
}

// ── Admin: user management ───────────────────────────────────
export function useAdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchUsers = useCallback(async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) { return }

      const { data: statuses } = await supabase
        .from('staff_status')
        .select('staff_id, status, location, updated_at')

      const statusMap = {}
      for (const row of statuses ?? []) {
        const prev = statusMap[row.staff_id]
        if (!prev || (row.updated_at ?? '') > (prev.updated_at ?? '')) {
          statusMap[row.staff_id] = row
        }
      }

      setUsers((profiles ?? []).map(u => ({
        ...u,
        staff_status: statusMap[u.id] ? [statusMap[u.id]] : [],
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()

    const channel = supabase
      .channel(channelName('admin-users'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_status' }, fetchUsers)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, fetchUsers)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchUsers])

  async function createStaffUser({ full_name, email, department, password, honorific, photo }) {
    const { data: authData, error: authError } = await anonClient.auth.signUp({
      email,
      password,
      options: { data: { full_name, role: 'staff', department, honorific } },
    })
    if (authError) return { error: authError }

    const userId = authData?.user?.id

    // Explicitly save honorific — the trigger may not include it if schema wasn't updated
    if (userId && honorific) {
      await supabase.from('profiles').update({ honorific }).eq('id', userId)
    }

    // Upload profile photo if provided
    if (photo && userId) {
      const ext = photo.name.split('.').pop()
      const path = `${userId}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, photo, { upsert: true, contentType: photo.type })
      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        await supabase.from('profiles').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', userId)
      }
    }

    await fetchUsers()
    return { data: authData, error: null }
  }

  async function createStudentUser({ full_name, student_id, department }) {
    const email = `${student_id.toLowerCase()}@student.stafftrack.app`
    const { data: authData, error: authError } = await anonClient.auth.signUp({
      email,
      password: student_id,
      options: { data: { full_name, role: 'student', department, student_id } },
    })
    if (authError) return { error: authError }
    await fetchUsers()
    return { data: authData, error: null }
  }

  async function updateUserRole(userId, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) return { error }

    // The signup trigger creates a staff_status row only on auth.users INSERT,
    // so someone promoted to faculty afterwards has none — they would show as
    // permanently Offline in the directory. writeStaffStatus creates it.
    if (role === 'staff') {
      const { error: statusError } = await writeStaffStatus(userId, {
        status: 'offline',
        location: '',
        note: '',
      })
      if (statusError) return { error: statusError }
    }

    await fetchUsers()
    return { error: null }
  }

  async function updateHonorific(userId, honorific) {
    const { error } = await supabase.from('profiles').update({ honorific: honorific || null }).eq('id', userId)
    if (!error) await fetchUsers()
    return { error }
  }

  async function updateUserName(userId, full_name) {
    const { error } = await supabase.from('profiles').update({ full_name }).eq('id', userId)
    if (!error) await fetchUsers()
    return { error }
  }

  async function resetUserPassword(userId, newPassword) {
    const { error } = await supabase.rpc('admin_reset_password', {
      user_id: userId,
      new_password: newPassword,
    })
    return { error }
  }

  async function deleteUser(userId) {
    // Calls a SECURITY DEFINER function that deletes from auth.users.
    // Deleting auth.users cascades to profiles → staff_status → activity_log via FK.
    const { error } = await supabase.rpc('delete_user_completely', { user_id: userId })
    if (!error) await fetchUsers()
    return { error }
  }

  async function overrideStaffStatus(staffId, status, location) {
    const { error } = await writeStaffStatus(staffId, { status, location })
    if (!error) await fetchUsers()
    return { error }
  }

  return { users, loading, refetch: fetchUsers, createStaffUser, createStudentUser, updateUserRole, updateHonorific, updateUserName, resetUserPassword, deleteUser, overrideStaffStatus }
}

// ── Schedule requests (student ↔ faculty) ───────────────────
export function useScheduleRequests() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchRequests = useCallback(async () => {
    if (!profile?.id) return

    const { data, error } = await supabase
      .from('schedule_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error || !data) { setLoading(false); return }

    const ids = [...new Set([...data.map(r => r.student_id), ...data.map(r => r.staff_id)])]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, honorific, department, avatar_url, student_id')
      .in('id', ids)

    const pm = {}
    for (const p of profiles ?? []) pm[p.id] = p

    setRequests(data.map(r => ({ ...r, student: pm[r.student_id] ?? null, staff: pm[r.staff_id] ?? null })))
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    fetchRequests()
    const channel = supabase
      .channel(channelName('schedule-reqs'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_requests' }, fetchRequests)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchRequests])

  async function submitRequest({ staff_id, subject, message, preferred_date, preferred_time, duration_mins }) {
    const { data: inserted, error } = await supabase.from('schedule_requests').insert({
      student_id: profile.id,
      staff_id,
      subject,
      message: message || '',
      preferred_date,
      preferred_time,
      duration_mins: duration_mins || 30,
    }).select().single()

    if (!error && inserted) {
      await supabase.from('notifications').insert({
        user_id: staff_id,
        type: 'schedule_request',
        title: 'New Schedule Request',
        body: `${profile.full_name} requested a meeting: "${subject}"`,
        request_id: inserted.id,
      })
      await fetchRequests()
    }
    return { error }
  }

  async function respondToRequest(requestId, status, staff_note = '') {
    const req = requests.find(r => r.id === requestId)
    const { error } = await supabase
      .from('schedule_requests')
      .update({ status, staff_note, updated_at: new Date().toISOString() })
      .eq('id', requestId)

    if (!error && req) {
      const facultyName = profile.honorific
        ? `${profile.honorific} ${profile.full_name}`
        : profile.full_name
      await supabase.from('notifications').insert({
        user_id: req.student_id,
        type: `schedule_${status}`,
        title: status === 'accepted' ? 'Request Accepted' : 'Request Declined',
        body: `${facultyName} ${status} your meeting request: "${req.subject}"`,
        request_id: requestId,
      })
      await fetchRequests()
    }
    return { error }
  }

  async function cancelRequest(requestId) {
    const req = requests.find(r => r.id === requestId)
    const { error } = await supabase
      .from('schedule_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', requestId)

    if (!error && req) {
      await supabase.from('notifications').insert({
        user_id: req.staff_id,
        type: 'schedule_cancelled',
        title: 'Meeting Request Cancelled',
        body: `${profile.full_name} cancelled their request: "${req.subject}"`,
        request_id: requestId,
      })
      await fetchRequests()
    }
    return { error }
  }

  return { requests, loading, submitRequest, respondToRequest, cancelRequest, refetch: fetchRequests }
}

// ── Thesis / project submissions (student → assigned faculty) ─
export const MAX_SUBMISSION_BYTES = 15 * 1024 * 1024 // 15 MB — bucket enforces this too

// Group a flat submission list into revision chains, newest version first.
// Chain root is parent_id for revisions, or the row's own id for a v1.
export function groupSubmissionChains(submissions) {
  const chains = new Map()
  for (const s of submissions) {
    const root = s.parent_id ?? s.id
    if (!chains.has(root)) chains.set(root, [])
    chains.get(root).push(s)
  }
  return [...chains.values()]
    .map(versions => versions.sort((a, b) => b.version - a.version))
    .sort((a, b) => (b[0].created_at ?? '').localeCompare(a[0].created_at ?? ''))
}

export function useSubmissions() {
  const { profile } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchSubmissions = useCallback(async () => {
    if (!profile?.id) return

    // RLS already narrows this to own / assigned / all-for-admin
    const { data, error } = await supabase
      .from('thesis_submissions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error || !data) { setLoading(false); return }

    const ids = [...new Set([...data.map(s => s.student_id), ...data.map(s => s.staff_id)])]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, honorific, department, avatar_url, student_id')
      .in('id', ids)

    const pm = {}
    for (const p of profiles ?? []) pm[p.id] = p

    setSubmissions(data.map(s => ({ ...s, student: pm[s.student_id] ?? null, staff: pm[s.staff_id] ?? null })))
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    fetchSubmissions()
    const channel = supabase
      .channel(channelName('submissions'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thesis_submissions' }, fetchSubmissions)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchSubmissions])

  // `previous` is the submission being revised — omit it for a first submission
  async function submitWork({ staff_id, title, doc_type, abstract, file, previous = null }) {
    if (!file) return { error: { message: 'Please attach a PDF file.' } }
    if (file.type !== 'application/pdf') return { error: { message: 'Only PDF files are accepted.' } }
    if (file.size > MAX_SUBMISSION_BYTES) {
      return { error: { message: `File is too large. Maximum size is ${MAX_SUBMISSION_BYTES / 1024 / 1024} MB.` } }
    }

    const version = previous ? previous.version + 1 : 1
    const parent_id = previous ? (previous.parent_id ?? previous.id) : null
    // First folder must be the uploader's uid — the storage policy checks it
    const file_path = `${profile.id}/${crypto.randomUUID()}_v${version}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('submissions')
      .upload(file_path, file, { contentType: 'application/pdf', upsert: false })
    if (uploadError) return { error: uploadError }

    const { data: inserted, error } = await supabase.from('thesis_submissions').insert({
      student_id: profile.id,
      staff_id,
      title,
      doc_type,
      abstract: abstract || '',
      file_path,
      file_name: file.name,
      file_size: file.size,
      version,
      parent_id,
    }).select().single()

    // Best-effort cleanup so a failed insert doesn't leave an orphaned PDF.
    // Storage deletes are admin-only, so for a student this call is denied and
    // the stray file simply stays in the bucket — deliberate, since a broader
    // delete policy would let a student remove a PDF after it was reviewed.
    if (error) {
      await supabase.storage.from('submissions').remove([file_path])
      return { error }
    }

    await supabase.from('notifications').insert({
      user_id: staff_id,
      type: 'submission_new',
      title: version > 1 ? 'Revised Submission Received' : 'New Submission Received',
      body: `${profile.full_name} submitted ${doc_type === 'thesis' ? 'a thesis' : 'a project report'}: "${title}"${version > 1 ? ` (v${version})` : ''}`,
      submission_id: inserted.id,
    })

    // Deliberately NOT written to activity_log: that table is readable by every
    // authenticated user (its policy is USING (true), and useStaffList depends
    // on that for realtime), so a title there would leak to other students.
    // The submission history is read back from thesis_submissions instead.

    await fetchSubmissions()
    return { data: inserted, error: null }
  }

  // Faculty opens the file for reading — flips submitted → under_review
  async function startReview(id) {
    const { error } = await supabase
      .from('thesis_submissions')
      .update({ status: 'under_review', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error }

    const sub = submissions.find(s => s.id === id)
    if (sub) {
      await supabase.from('notifications').insert({
        user_id: sub.student_id,
        type: 'submission_under_review',
        title: 'Submission Under Review',
        body: `${facultyLabel(profile)} started reviewing "${sub.title}"`,
        submission_id: id,
      })
    }
    await fetchSubmissions()
    return { error: null }
  }

  // One call covers approve / reject / request-revision, with optional edits to
  // the title and type applied in the same action ("edit and approve")
  async function reviewSubmission(id, { status, feedback = '', title, doc_type }) {
    const sub = submissions.find(s => s.id === id)

    const patch = {
      status,
      feedback,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
      updated_at: new Date().toISOString(),
    }
    if (title) patch.title = title
    if (doc_type) patch.doc_type = doc_type

    const { error } = await supabase.from('thesis_submissions').update(patch).eq('id', id)
    if (error) return { error }

    if (sub) {
      const NOTIF = {
        approved:           { type: 'submission_approved', title: 'Submission Approved' },
        rejected:           { type: 'submission_rejected', title: 'Submission Denied' },
      }
      const n = NOTIF[status]
      if (n) {
        await supabase.from('notifications').insert({
          user_id: sub.student_id,
          type: n.type,
          title: n.title,
          body: `${facultyLabel(profile)} ${STATUS_VERB[status]} "${title || sub.title}" (v${sub.version})`,
          submission_id: id,
        })
      }
    }

    await fetchSubmissions()
    return { error: null }
  }

  // Bucket is private — hand out a short-lived signed URL instead of a public one
  async function getFileUrl(filePath) {
    const { data, error } = await supabase.storage
      .from('submissions')
      .createSignedUrl(filePath, 300)
    if (error) return { error }
    return { url: data.signedUrl, error: null }
  }

  return { submissions, loading, submitWork, startReview, reviewSubmission, getFileUrl, refetch: fetchSubmissions }
}

// Phrased to read naturally after a faculty name: "Dr Karim approved …"
const STATUS_VERB = {
  approved:           'approved',
  rejected:           'denied',
}

function facultyLabel(p) {
  return p?.honorific ? `${p.honorific} ${p.full_name}` : (p?.full_name ?? 'Faculty')
}

// ── Location QR registry (admin) ─────────────────────────────

// The kinds an admin can pick, and the status each proposes. Mirrors the CHECK
// constraints in 20260818_locations.sql — keep the two in step.
export const LOCATION_KINDS = [
  { id: 'classroom', label: 'Classroom',    icon: 'school',        status: 'in-class' },
  { id: 'lab',       label: 'Lab',          icon: 'science',       status: 'in-lab' },
  { id: 'office',    label: 'Office',       icon: 'meeting_room',  status: 'available' },
  { id: 'meeting',   label: 'Meeting Room', icon: 'groups',        status: 'meeting' },
  { id: 'library',   label: 'Library',      icon: 'local_library', status: 'available' },
  { id: 'other',     label: 'Other',        icon: 'location_on',   status: 'available' },
]

// A room cannot set an absent status — you cannot scan a wall to declare
// yourself off campus. Matches the CHECK constraint on locations.status.
export const LOCATION_STATUSES = [
  'available', 'in-class', 'in-lab', 'meeting', 'busy', 'on-break', 'away',
]

// PostgREST answers a request for a table it does not know about with
// PGRST205 / "Could not find the table ... in the schema cache", which is
// accurate but tells the reader nothing about what to do. It means one of two
// things: the migration has not been applied, or it has and PostgREST is still
// serving a stale cache.
export function isMissingTable(error) {
  if (!error) return false
  return error.code === 'PGRST205'
    || error.code === '42P01'
    || /could not find the table|schema cache|does not exist/i.test(error.message ?? '')
}

export function useLocations() {
  const { profile } = useAuth()
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)

  const fetchLocations = useCallback(async () => {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name')
    setSetupNeeded(isMissingTable(error))
    if (!error && data) setLocations(data)
    setLoading(false)
    return { error }
  }, [])

  useEffect(() => {
    fetchLocations()
    const channel = supabase
      .channel(channelName('locations'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchLocations)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchLocations])

  async function createLocation({ name, kind, status }) {
    const { data, error } = await supabase
      .from('locations')
      .insert({ name: name.trim(), kind, status, created_by: profile?.id })
      .select()
      .single()
    if (!error) await fetchLocations()
    return { data, error }
  }

  // Editing a room changes what every sheet already printed for it does —
  // that is the point of storing them rather than baking the values into the QR
  async function updateLocation(id, patch) {
    const clean = { ...patch }
    if (typeof clean.name === 'string') clean.name = clean.name.trim()
    const { error } = await supabase.from('locations').update(clean).eq('id', id)
    if (!error) await fetchLocations()
    return { error }
  }

  async function deleteLocation(id) {
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (!error) await fetchLocations()
    return { error }
  }

  return { locations, loading, setupNeeded, createLocation, updateLocation, deleteLocation, refetch: fetchLocations }
}

// Resolve a scanned location id. Used by the check-in page, which runs as a
// faculty member — the SELECT policy is open to any signed-in user.
export async function fetchLocationById(id) {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, kind, status, active')
    .eq('id', id)
    .maybeSingle()
  return { location: data ?? null, error }
}

// ── Announcements (faculty → all students, or one of their groups) ─

export function useAnnouncements() {
  const { profile } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)

  const fetchAnnouncements = useCallback(async () => {
    if (!profile?.id) return

    // RLS does the narrowing: faculty get their own posts, and a student gets
    // the posts for all students plus those for the groups they are in
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })

    setSetupNeeded(isMissingTable(error))
    if (error || !data) { setLoading(false); return }

    const authorIds = [...new Set(data.map(a => a.author_id))]
    const groupIds = [...new Set(data.map(a => a.group_id).filter(Boolean))]
    const [{ data: authors }, { data: groups }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, honorific, department, avatar_url').in('id', authorIds),
      supabase.from('announcement_groups').select('id, name').in('id', groupIds),
    ])

    const pm = {}
    for (const p of authors ?? []) pm[p.id] = p
    const gm = {}
    for (const g of groups ?? []) gm[g.id] = g

    setAnnouncements(data.map(a => ({ ...a, author: pm[a.author_id] ?? null, group: gm[a.group_id] ?? null })))
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    fetchAnnouncements()
    const channel = supabase
      .channel(channelName('announcements'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, fetchAnnouncements)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAnnouncements])

  // `group_id` null means every student. Recipients are notified by a trigger
  // in the same transaction as this insert (20261017_announcements.sql), so a
  // post is never saved with only some of its notifications written.
  async function postAnnouncement({ title, body, group_id = null }) {
    const { data, error } = await supabase.from('announcements').insert({
      author_id: profile.id,
      audience: group_id ? 'group' : 'all',
      group_id,
      title: title.trim(),
      body: body.trim(),
    }).select().single()
    if (!error) await fetchAnnouncements()
    return { data, error }
  }

  // Only the topic and message can change; the audience is fixed once posted.
  // .select() because RLS turns a write to someone else's post into a
  // zero-row success rather than an error.
  async function updateAnnouncement(id, { title, body }) {
    const { data, error } = await supabase
      .from('announcements')
      .update({ title: title.trim(), body: body.trim() })
      .eq('id', id)
      .select('id')
    if (error) return { error }
    if (!data?.length) return { error: { message: 'You can only edit your own announcements.' } }
    await fetchAnnouncements()
    return { error: null }
  }

  // Its notifications go with it (ON DELETE CASCADE)
  async function deleteAnnouncement(id) {
    const { data, error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id)
      .select('id')
    if (error) return { error }
    if (!data?.length) return { error: { message: 'You can only delete your own announcements.' } }
    await fetchAnnouncements()
    return { error: null }
  }

  return { announcements, loading, setupNeeded, postAnnouncement, updateAnnouncement, deleteAnnouncement, refetch: fetchAnnouncements }
}

// A faculty member's own groups, each with the ids of its students, plus every
// student account to pick members from. A group is also a classroom.
export function useAnnouncementGroups() {
  const { profile } = useAuth()
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)

  const fetchGroups = useCallback(async () => {
    if (!profile?.id) return

    const [{ data: rows, error }, { data: studentRows }] = await Promise.all([
      supabase.from('announcement_groups').select('*').eq('owner_id', profile.id).order('name'),
      supabase.from('profiles').select('id, full_name, student_id, department, avatar_url').eq('role', 'student').order('full_name'),
    ])
    setSetupNeeded(isMissingTable(error))
    if (error || !rows) { setLoading(false); return }

    const { data: members } = await supabase
      .from('announcement_group_members')
      .select('group_id, student_id')
      .in('group_id', rows.map(g => g.id))

    const byGroup = {}
    for (const m of members ?? []) {
      if (!byGroup[m.group_id]) byGroup[m.group_id] = []
      byGroup[m.group_id].push(m.student_id)
    }

    setGroups(rows.map(g => ({ ...g, memberIds: byGroup[g.id] ?? [] })))
    setStudents(studentRows ?? [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  async function createGroup({ name, memberIds }) {
    const { data: group, error } = await supabase
      .from('announcement_groups')
      .insert({ owner_id: profile.id, name: name.trim() })
      .select()
      .single()
    if (error) return { error }

    if (memberIds.length) {
      const { error: memberError } = await supabase
        .from('announcement_group_members')
        .insert(memberIds.map(student_id => ({ group_id: group.id, student_id })))
      if (memberError) {
        // Don't leave a half-made group behind
        await supabase.from('announcement_groups').delete().eq('id', group.id)
        return { error: memberError }
      }
    }

    await fetchGroups()
    return { data: group, error: null }
  }

  // Membership is saved as a diff against what is stored, rather than
  // clear-and-reinsert, so a failure part-way can never leave the group empty
  async function updateGroup(id, { name, memberIds }) {
    const current = groups.find(g => g.id === id)
    if (!current) return { error: { message: 'That group no longer exists.' } }

    if (name.trim() !== current.name) {
      const { data, error } = await supabase
        .from('announcement_groups')
        .update({ name: name.trim() })
        .eq('id', id)
        .select('id')
      if (error) return { error }
      if (!data?.length) return { error: { message: 'You can only edit your own groups.' } }
    }

    const keep = new Set(memberIds)
    const had = new Set(current.memberIds)
    const added = memberIds.filter(sid => !had.has(sid))
    const removed = current.memberIds.filter(sid => !keep.has(sid))

    if (added.length) {
      const { error } = await supabase
        .from('announcement_group_members')
        .insert(added.map(student_id => ({ group_id: id, student_id })))
      if (error) { await fetchGroups(); return { error } }
    }
    if (removed.length) {
      const { error } = await supabase
        .from('announcement_group_members')
        .delete()
        .eq('group_id', id)
        .in('student_id', removed)
      if (error) { await fetchGroups(); return { error } }
    }

    await fetchGroups()
    return { error: null }
  }

  // The row cascades to its memberships, announcements, chat and file records.
  // The stored files are not rows, so they are removed from the bucket first;
  // otherwise every file students submitted would be orphaned there. Stops
  // before deleting anything if that fails, so it can simply be retried.
  async function deleteGroup(id) {
    const { data: files, error: listError } = await supabase
      .from('class_files')
      .select('file_path')
      .eq('group_id', id)
    // No class_files table yet means the classrooms migration is not applied
    // and there are no files to remove
    if (listError && !isMissingTable(listError)) return { error: listError }

    const paths = (files ?? []).map(f => f.file_path)
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(CLASS_FILES_BUCKET).remove(paths.slice(i, i + 100))
      if (error) return { error }
    }

    const { data, error } = await supabase
      .from('announcement_groups')
      .delete()
      .eq('id', id)
      .select('id')
    if (error) return { error }
    if (!data?.length) return { error: { message: 'You can only delete your own classrooms.' } }
    await fetchGroups()
    return { error: null }
  }

  return { groups, students, loading, setupNeeded, createGroup, updateGroup, deleteGroup, refetch: fetchGroups }
}

// ── Classrooms (a group's chat and the work its students submit) ─

export const CLASS_FILES_BUCKET = 'class-files'
export const MAX_CLASS_FILE_BYTES = 15 * 1024 * 1024 // 15 MB — the bucket enforces this too

// Accepted extensions and the type each is uploaded as. Mirrors the bucket's
// allowed_mime_types in 20261017b_classrooms.sql — keep the two in step. The
// type comes from the extension rather than file.type, which some browsers
// leave empty or report differently (ZIP especially).
export const CLASS_FILE_TYPES = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt:  'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  zip:  'application/zip',
}
export const CLASS_FILE_ACCEPT = Object.keys(CLASS_FILE_TYPES).map(ext => `.${ext}`).join(',')

const extensionOf = name => (name.includes('.') ? name.split('.').pop().toLowerCase() : '')
export const classFileType = name => CLASS_FILE_TYPES[extensionOf(name)] ?? null

// Returns what is wrong with a file, or null if it can be uploaded
export function checkClassFile(file) {
  if (!file) return 'Choose a file to upload.'
  if (!classFileType(file.name)) return 'That file type is not accepted. Use PDF, Word, PowerPoint, Excel, an image or a ZIP.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_CLASS_FILE_BYTES) return `File is too large. Maximum size is ${MAX_CLASS_FILE_BYTES / 1024 / 1024} MB.`
  return null
}

// How many files a classroom holds, counting every version — shown before
// it is deleted
export async function countClassFiles(groupId) {
  const { data, error } = await supabase.from('class_files').select('id').eq('group_id', groupId)
  if (error) return { count: 0, error: isMissingTable(error) ? null : error }
  return { count: data.length, error: null }
}

// The classrooms a student is in, each with its teacher
export function useMyClasses() {
  const { profile } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)

  const fetchClasses = useCallback(async () => {
    if (!profile?.id) return

    // RLS returns only the groups this student is a member of
    const { data, error } = await supabase.from('announcement_groups').select('*').order('name')
    setSetupNeeded(isMissingTable(error))
    if (error || !data) { setLoading(false); return }

    const { data: teachers } = await supabase
      .from('profiles')
      .select('id, full_name, honorific, avatar_url, department')
      .in('id', [...new Set(data.map(g => g.owner_id))])
    const tm = {}
    for (const t of teachers ?? []) tm[t.id] = t

    setClasses(data.map(g => ({ ...g, teacher: tm[g.owner_id] ?? null })))
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  return { classes, loading, setupNeeded, refetch: fetchClasses }
}

// The chat keeps the latest messages only; older ones are not paged in
export const CHAT_HISTORY_LIMIT = 200

// One classroom: its chat and the work submitted to it. RLS decides what each
// user gets — the teacher every student's files, a student only their own.
export function useClassroom(groupId) {
  const { profile } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])   // teacher only; RLS hides the list from students
  const [messages, setMessages] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [setupNeeded, setSetupNeeded] = useState(false)

  // Profiles of everyone who has written or submitted, fetched once each
  const people = useRef(new Map())
  const loadPeople = useCallback(async ids => {
    const unknown = ids.filter(id => !people.current.has(id))
    if (!unknown.length) return
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, honorific, avatar_url, student_id, department')
      .in('id', unknown)
    for (const p of data ?? []) people.current.set(p.id, p)
  }, [])

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('class_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY_LIMIT)
    if (error) { if (isMissingTable(error)) setSetupNeeded(true); return }
    await loadPeople([...new Set(data.map(m => m.sender_id))])
    setMessages(data.reverse().map(m => ({ ...m, sender: people.current.get(m.sender_id) ?? null })))
  }, [groupId, loadPeople])

  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('class_files')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
    if (error) { if (isMissingTable(error)) setSetupNeeded(true); return }
    await loadPeople([...new Set(data.map(f => f.student_id))])
    setFiles(data.map(f => ({ ...f, student: people.current.get(f.student_id) ?? null })))
  }, [groupId, loadPeople])

  useEffect(() => {
    if (!profile?.id || !groupId) return
    let cancelled = false

    async function load() {
      // RLS returns the group only to its teacher and its current students
      const { data: g } = await supabase.from('announcement_groups').select('*').eq('id', groupId).maybeSingle()
      if (cancelled) return
      if (!g) { setMissing(true); setLoading(false); return }

      await loadPeople([g.owner_id])
      if (g.owner_id === profile.id) {
        const { data: rows } = await supabase
          .from('announcement_group_members')
          .select('student_id')
          .eq('group_id', groupId)
        const ids = (rows ?? []).map(r => r.student_id)
        await loadPeople(ids)
        if (!cancelled) {
          setMembers(ids.map(id => people.current.get(id)).filter(Boolean)
            .sort((a, b) => a.full_name.localeCompare(b.full_name)))
        }
      }
      await Promise.all([fetchMessages(), fetchFiles()])
      if (cancelled) return
      setGroup({ ...g, teacher: people.current.get(g.owner_id) ?? null })
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel(channelName(`classroom-${groupId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_messages', filter: `group_id=eq.${groupId}` }, fetchMessages)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_files', filter: `group_id=eq.${groupId}` }, fetchFiles)
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [profile?.id, groupId, loadPeople, fetchMessages, fetchFiles])

  async function sendMessage(body) {
    const { error } = await supabase
      .from('class_messages')
      .insert({ group_id: groupId, sender_id: profile.id, body: body.trim() })
    if (!error) await fetchMessages()
    return { error }
  }

  // `previous` is any version of the file being updated; omit it to submit a
  // new one. The version number is worked out by the database.
  async function submitWork(file, previous = null) {
    const problem = checkClassFile(file)
    if (problem) return { error: { message: problem } }

    const type = classFileType(file.name)
    // First folder is the classroom, second the student: the storage policies check both
    const file_path = `${groupId}/${profile.id}/${crypto.randomUUID()}.${extensionOf(file.name)}`

    const { error: uploadError } = await supabase.storage
      .from(CLASS_FILES_BUCKET)
      .upload(file_path, file, { contentType: type, upsert: false })
    if (uploadError) return { error: uploadError }

    const { data, error } = await supabase.from('class_files').insert({
      group_id: groupId,
      student_id: profile.id,
      parent_id: previous ? (previous.parent_id ?? previous.id) : null,
      file_path,
      file_name: file.name,
      file_size: file.size,
      mime_type: type,
    }).select().single()

    // Students cannot delete from the bucket (that would let them remove
    // submitted work), so a failed insert leaves the upload behind. Nothing
    // shows it: files are listed from rows, and it has none.
    if (error) return { error }

    await fetchFiles()
    return { data, error: null }
  }

  // Bucket is private — hand out a short-lived signed URL. PDFs and images
  // open in the browser; anything else downloads under its original name.
  async function getFileUrl(f) {
    const inline = f.mime_type === 'application/pdf' || f.mime_type?.startsWith('image/')
    const { data, error } = await supabase.storage
      .from(CLASS_FILES_BUCKET)
      .createSignedUrl(f.file_path, 300, inline ? undefined : { download: f.file_name })
    if (error) return { error }
    return { url: data.signedUrl, inline, error: null }
  }

  return { group, members, messages, files, loading, missing, setupNeeded, sendMessage, submitWork, getFileUrl }
}

// ── Notifications ────────────────────────────────────────────

// AppLayout and each page call useNotifications() separately, so they hold
// independent state. This lets a mark-read in one instance refresh the others —
// without it, clearing notifications on a page would leave the topbar badge
// stale until remount. A realtime UPDATE event can't do this job: passing RLS
// on an UPDATE payload requires REPLICA IDENTITY FULL, which notifications
// doesn't have, so read-state changes are not reliably broadcast by Postgres.
const notifListeners = new Set()
const broadcastNotifChange = () => { for (const fn of notifListeners) fn() }

export function useNotifications() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setNotifications(data)
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    fetchNotifications()
    if (!profile?.id) return
    const channel = supabase
      .channel(channelName(`notifs-${profile.id}`))
      .on('postgres_changes', {
        // '*' not 'INSERT' so read-state changes made in another tab arrive too
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, fetchNotifications)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchNotifications, profile?.id])

  // Keep every mounted instance in sync with the others
  useEffect(() => {
    notifListeners.add(fetchNotifications)
    return () => { notifListeners.delete(fetchNotifications) }
  }, [fetchNotifications])

  const unreadCount = notifications.filter(n => !n.read).length

  // Ids we have already tried to mark read. Without this, a write that affects
  // zero rows triggers fetchNotifications, which sets a NEW array identity,
  // which recreates markReadByType, which re-fires the mount effect on the
  // page — a hot loop hammering the database. One attempt per id per session.
  const attemptedRef = useRef(new Set())

  // Every mark-read path goes through here. .select() is what makes it honest:
  // an RLS-filtered UPDATE that matches no row returns success with zero rows,
  // so without checking the result we would clear the badge locally while the
  // database still says unread — and the dot would reappear on the next mount.
  async function setRead(idsIn) {
    const ids = idsIn.filter(id => !attemptedRef.current.has(id))
    if (!ids.length || !profile?.id) return { error: null }
    ids.forEach(id => attemptedRef.current.add(id))

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', ids)
      .eq('user_id', profile.id)
      .select('id')

    if (error) {
      console.error('notifications: mark-read failed', error)
      return { error }
    }
    if ((data?.length ?? 0) !== ids.length) {
      // Wrote fewer rows than asked for — trust the server, not the guess
      console.warn(`notifications: marked ${data?.length ?? 0}/${ids.length} read`)
      await fetchNotifications()
      return { error: null }
    }

    const done = new Set(data.map(r => r.id))
    setNotifications(prev => prev.map(n => (done.has(n.id) ? { ...n, read: true } : n)))
    broadcastNotifChange()   // refresh the topbar badge and any other instance
    return { error: null }
  }

  const markAsRead = id => setRead([id])

  const markAllRead = () => setRead(notifications.filter(n => !n.read).map(n => n.id))

  // Clears a page's own notifications when that page is opened. Without this the
  // badge only ever cleared by clicking the item in the bell dropdown, so
  // reaching the page from the sidebar left the dot showing after viewing.
  // `match` narrows it further, e.g. to one classroom's notifications.
  const markReadByType = useCallback((types, match = () => true) => {
    const wanted = new Set(types)
    const ids = notifications.filter(n => !n.read && wanted.has(n.type) && match(n)).map(n => n.id)
    if (ids.length) setRead(ids)
  }, [notifications]) // eslint-disable-line react-hooks/exhaustive-deps

  return { notifications, loading, unreadCount, markAsRead, markAllRead, markReadByType, refetch: fetchNotifications }
}

// ── Dashboard stats ──────────────────────────────────────────
// Previously counted only available/meeting/away/offline, so the six other
// statuses appeared in no tile and the headline numbers did not add up to the
// department total. These three groups are exhaustive and mutually exclusive:
// available + occupied + absent === total.
const OCCUPIED_STATUSES = ['meeting', 'in-class', 'in-lab', 'busy', 'on-break', 'away']

export function useDashboardStats(staff = []) {
  const count = pred => staff.filter(pred).length
  const onCampus = count(s => !ABSENT_STATUSES.includes(s.status))

  const stats = {
    total: staff.length,
    onCampus,
    onCampusPct: staff.length ? Math.round((onCampus / staff.length) * 100) : 0,

    available: count(s => s.status === 'available'),
    occupied: count(s => OCCUPIED_STATUSES.includes(s.status)),
    absent: count(s => ABSENT_STATUSES.includes(s.status)),
  }

  return { stats }
}
