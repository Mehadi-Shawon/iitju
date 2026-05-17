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
      await supabase.from('activity_log').insert({
        staff_id: profile.id,
        action: 'status_update',
        detail: `Status set to ${newStatus}${location ? ' · ' + location : ''}`,
      })
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

  const fetchLogs = useCallback(async () => {
    if (!staffId) return
    let query = supabase
      .from('activity_log')
      .select('*, profiles(full_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (staffId !== 'all') query = query.eq('staff_id', staffId)

    const { data, error } = await query
    if (!error) setLogs(data || [])
    setLoading(false)
  }, [staffId, limit])

  useEffect(() => {
    fetchLogs()

    const channel = supabase
      .channel(`activity-log-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, fetchLogs)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchLogs])

  return { logs, loading }
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

  async function createStaffUser({ full_name, email, department, password, honorific }) {
    const { data: authData, error: authError } = await anonClient.auth.signUp({
      email,
      password,
      options: { data: { full_name, role: 'staff', department, honorific } },
    })
    if (authError) return { error: authError }
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

  async function deleteUser(userId) {
    // Delete the profile row; FK cascades remove staff_status + activity_log.
    // (auth.admin.deleteUser requires a service-role key — not available client-side)
    const { error } = await supabase.from('profiles').delete().eq('id', userId)
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

  return { users, loading, refetch: fetchUsers, createStaffUser, createStudentUser, updateUserRole, updateHonorific, deleteUser, overrideStaffStatus }
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
