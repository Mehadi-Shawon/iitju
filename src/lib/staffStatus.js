import { supabase } from '@/lib/supabase'

// The ten values the UI offers, and the order they are presented in.
//
// Not yet the single importable source of truth: StatusBadge, the status picker
// and the dashboard filter row each still carry their own copy with labels and
// colours attached. Consolidating those is worthwhile but touches shared UI, so
// this list exists for validation and as the reference the others must match.
export const STATUS_VALUES = [
  'available', 'in-class', 'in-lab', 'meeting',
  'busy', 'on-break', 'away',
  'off-campus', 'on-leave', 'offline',
]

// Statuses that mean "not on campus at all"
export const ABSENT_STATUSES = ['off-campus', 'on-leave', 'offline']

/**
 * Write a staff_status row, creating it if it does not exist.
 *
 * The signup trigger only inserts a staff_status row when role === 'staff', so
 * admins — and anyone promoted to faculty later — have no row. PostgREST answers
 * an UPDATE that matches zero rows with 204 and error === null, so a plain
 * `.update()` silently succeeds while writing nothing. Every caller went through
 * that path and reported success regardless.
 *
 * `.select()` makes the write honest: if no row came back, insert one.
 */
export async function writeStaffStatus(staffId, patch) {
  if (!staffId) return { error: { message: 'No user id' } }

  const row = { ...patch, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('staff_status')
    .update(row)
    .eq('staff_id', staffId)
    .select('staff_id')

  if (error) return { error }
  if (data && data.length > 0) return { error: null }

  // No row existed — create it. RLS allows this for your own row, and for
  // anyone if you are an admin.
  const { error: insertError } = await supabase
    .from('staff_status')
    .insert({ staff_id: staffId, ...row })

  return { error: insertError ?? null }
}
