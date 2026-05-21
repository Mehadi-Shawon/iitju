import { useEffect, useState, useCallback } from 'react'
import { supabase, anonClient } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

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
      .channel(`staff-watcher-${Date.now()}`)
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
    const { error } = await supabase
      .from('staff_status')
      .update({ status: newStatus, location, note, updated_at: new Date().toISOString() })
      .eq('staff_id', profile.id)

    if (!error) {
      const { error: logError } = await supabase.from('activity_log').insert({
        staff_id: profile.id,
        action: 'status_update',
        detail: `Status set to ${newStatus}${location ? ' · ' + location : ''}`,
      })
      if (logError) console.error('activity_log insert failed:', logError)
      await fetchStatus()
    }
    return { error }
  }

  async function checkInViaQR(locationOverride) {
    const { error } = await supabase
      .from('staff_status')
      .update({
        status: 'available',
        location: locationOverride || status?.location || 'QR Check-in',
        note: 'Checked in via QR',
        updated_at: new Date().toISOString(),
      })
      .eq('staff_id', profile.id)

    if (!error) {
      await supabase.from('activity_log').insert({
        staff_id: profile.id,
        action: 'qr_checkin',
        detail: `QR check-in at ${locationOverride || 'campus'}`,
      })
      await fetchStatus()
    }
    return { error }
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
      .channel(`admin-users-${Date.now()}`)
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
    if (!error) await fetchUsers()
    return { error }
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
    const { error } = await supabase
      .from('staff_status')
      .update({ status, location, updated_at: new Date().toISOString() })
      .eq('staff_id', staffId)
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
      .channel(`schedule-reqs-${Date.now()}`)
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

// ── Notifications ────────────────────────────────────────────
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
      .channel(`notifs-${profile.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, fetchNotifications)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchNotifications, profile?.id])

  const unreadCount = notifications.filter(n => !n.read).length

  async function markAsRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    const ids = notifications.filter(n => !n.read).map(n => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read: true }).in('id', ids)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  return { notifications, loading, unreadCount, markAsRead, markAllRead }
}

// ── Dashboard stats ──────────────────────────────────────────
const ABSENT_STATUSES = ['offline', 'off-campus', 'on-leave']

export function useDashboardStats(staff = []) {
  const onCampus = staff.filter(s => !ABSENT_STATUSES.includes(s.status))
  const stats = {
    total: staff.length,
    available: staff.filter(s => s.status === 'available').length,
    meeting: staff.filter(s => s.status === 'meeting').length,
    away: staff.filter(s => s.status === 'away').length,
    offline: staff.filter(s => s.status === 'offline').length,
    onCampus: onCampus.length,
    onCampusPct: staff.length ? Math.round((onCampus.length / staff.length) * 100) : 0,
  }

  return { stats }
}
