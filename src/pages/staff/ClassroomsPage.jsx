import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnnouncementGroups, useAnnouncements, countClassFiles } from '@/hooks/useData'
import { Avatar, PageHeader, LoadingPage, EmptyState, Modal, Spinner } from '@/components/ui'
import toast from 'react-hot-toast'

const SHOWN_MEMBERS = 8

const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`
// "a", "a and b", "a, b and c"
const listOf = parts => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`)

export default function ClassroomsPage() {
  const navigate = useNavigate()
  const { groups, students, loading, setupNeeded, createGroup, updateGroup, deleteGroup } = useAnnouncementGroups()
  // Only to say, before a classroom is deleted, how many posts go with it
  const { announcements } = useAnnouncements()

  const [saving, setSaving] = useState(false)
  const [groupForm, setGroupForm] = useState(null)   // classroom open in the create/edit dialog
  const [deleting, setDeleting] = useState(null)     // { group, files, posts } pending deletion

  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students])
  const membersOf = g => g.memberIds.map(id => studentMap.get(id)).filter(Boolean)

  function openEditor(group) {
    setGroupForm(group
      ? { id: group.id, name: group.name, memberIds: new Set(membersOf(group).map(s => s.id)) }
      : { id: null, name: '', memberIds: new Set() })
  }

  async function handleSave(e) {
    e.preventDefault()
    const name = groupForm.name.trim()
    if (!name) return toast.error('Give the classroom a name')
    if (groups.some(g => g.id !== groupForm.id && g.name.toLowerCase() === name.toLowerCase())) {
      return toast.error('You already have a classroom with that name')
    }

    setSaving(true)
    const values = { name, memberIds: [...groupForm.memberIds] }
    const { error } = groupForm.id ? await updateGroup(groupForm.id, values) : await createGroup(values)
    setSaving(false)
    if (error) return toast.error(error.message || 'Could not save the classroom')

    toast.success(groupForm.id ? 'Classroom updated' : 'Classroom created')
    setGroupForm(null)
  }

  async function askDelete(group) {
    const { count, error } = await countClassFiles(group.id)
    if (error) return toast.error(error.message)
    setDeleting({ group, files: count, posts: announcements.filter(a => a.group_id === group.id).length })
  }

  async function handleDelete() {
    setSaving(true)
    const { error } = await deleteGroup(deleting.group.id)
    setSaving(false)
    if (error) return toast.error(error.message || 'Could not delete the classroom')
    setDeleting(null)
    toast.success('Classroom deleted')
  }

  if (loading) return <LoadingPage variant="grid" />

  if (setupNeeded) {
    return (
      <div>
        <PageHeader title="Classrooms" subtitle="Chat with a group of students and collect their work" />
        <div className="card">
          <EmptyState
            icon="database"
            title="Classrooms are not set up yet"
            description="Apply supabase/migrations/20261017_announcements.sql and then 20261017b_classrooms.sql in the Supabase SQL Editor, then reload this page."
          />
        </div>
      </div>
    )
  }

  const goingWith = deleting
    ? listOf([
        'its chat',
        deleting.files > 0 && `the ${plural(deleting.files, 'file')} students submitted`,
        deleting.posts > 0 && `the ${plural(deleting.posts, 'announcement')} sent to it`,
      ].filter(Boolean))
    : ''

  return (
    <div>
      <PageHeader
        title="Classrooms"
        subtitle="Chat with a group of students and collect their work. You can also send announcements to a classroom."
        action={
          <button className="btn-primary text-xs" onClick={() => openEditor(null)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New Classroom
          </button>
        }
      />

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="school"
            title="No classrooms yet"
            description="Create one for a course section, a lab group or a thesis team, and add its students."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map(g => (
            <ClassroomCard
              key={g.id}
              group={g}
              members={membersOf(g)}
              onOpen={() => navigate(`/app/staff/classrooms/${g.id}`)}
              onEdit={() => openEditor(g)}
              onDelete={() => askDelete(g)}
            />
          ))}
        </div>
      )}

      {/* ── Create / edit ── */}
      <Modal open={!!groupForm} onClose={() => setGroupForm(null)} title={groupForm?.id ? 'Edit Classroom' : 'New Classroom'} wide>
        {groupForm && (
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="form-label">Classroom Name</label>
              <input
                className="form-input"
                maxLength={80}
                placeholder="e.g. Thesis Group A"
                value={groupForm.name}
                onChange={e => setGroupForm(g => ({ ...g, name: e.target.value }))}
              />
            </div>
            <StudentPicker
              students={students}
              selected={groupForm.memberIds}
              onChange={memberIds => setGroupForm(g => ({ ...g, memberIds }))}
            />
            {groupForm.id && (
              <p className="text-[11px] text-text-faint leading-relaxed">
                Students you add see the classroom's chat and announcements, including
                earlier ones. Students you remove lose access, though the work they
                already submitted stays on record for you.
              </p>
            )}
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={() => setGroupForm(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>
                {saving ? <Spinner size={16} /> : groupForm.id ? 'Save Changes' : 'Create Classroom'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Delete ── */}
      <Modal open={!!deleting} onClose={() => { if (!saving) setDeleting(null) }} title="Delete Classroom">
        {deleting && (
          <div>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500" style={{ fontSize: 24 }}>delete</span>
            </div>
            <p className="text-sm text-text-muted text-center leading-relaxed break-words">
              Delete <strong className="text-text">{deleting.group.name}</strong>?{' '}
              {goingWith.charAt(0).toUpperCase() + goingWith.slice(1)} will be deleted too.
            </p>
            <p className="text-xs text-text-faint text-center mt-3">
              Student accounts are not affected. This cannot be undone.
            </p>
            <div className="flex gap-2.5 mt-6">
              <button onClick={() => setDeleting(null)} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
              <button onClick={handleDelete} className="btn-danger flex-1" disabled={saving}>
                {saving ? <Spinner size={16} /> : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ClassroomCard({ group, members, onOpen, onEdit, onDelete }) {
  // The buttons sit inside the clickable card, so they must not also open it
  const act = fn => e => { e.stopPropagation(); fn() }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      className="card p-4 sm:p-5 flex flex-col cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>school</span>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-text truncate">{group.name}</div>
            <div className="text-xs text-text-faint">{plural(members.length, 'student')}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 -mr-1">
          <button
            onClick={act(onEdit)}
            title="Edit"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-low hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
          </button>
          <button
            onClick={act(onDelete)}
            title="Delete"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          </button>
        </div>
      </div>

      {members.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-3.5">
          {members.slice(0, SHOWN_MEMBERS).map(s => (
            <span key={s.id} className="text-[11px] font-semibold px-2 py-1 rounded-full bg-surface-low text-text-muted max-w-full truncate">
              {s.full_name}
            </span>
          ))}
          {members.length > SHOWN_MEMBERS && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-surface-low text-text-faint">
              +{members.length - SHOWN_MEMBERS} more
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-faint mt-3.5">No students yet. Edit the classroom to add some.</p>
      )}

      {/* Pinned to the bottom, so it lines up across cards of different heights */}
      <div className="flex items-center gap-1 mt-auto pt-4 text-xs font-bold text-primary">
        Open classroom
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
      </div>
    </div>
  )
}

function StudentPicker({ students, selected, onChange }) {
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(s =>
      (s.full_name ?? '').toLowerCase().includes(q)
      || (s.student_id ?? '').toLowerCase().includes(q)
      || (s.department ?? '').toLowerCase().includes(q))
  }, [students, search])

  const allShownPicked = shown.length > 0 && shown.every(s => selected.has(s.id))

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  // Search narrows the list (by department, say, or an ID prefix), then one
  // click takes every match instead of ticking them one by one
  function toggleShown() {
    const next = new Set(selected)
    for (const s of shown) {
      if (allShownPicked) next.delete(s.id)
      else next.add(s.id)
    }
    onChange(next)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label className="form-label mb-0">
          Students <span className="font-normal text-text-faint">· {selected.size} selected</span>
        </label>
        {shown.length > 0 && (
          <button type="button" onClick={toggleShown} className="text-xs font-semibold text-primary hover:underline shrink-0">
            {allShownPicked ? 'Unselect shown' : 'Select all shown'}
          </button>
        )}
      </div>

      <div className="relative mb-2">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>search</span>
        <input
          className="form-input pl-9"
          placeholder="Search by name, student ID or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="border border-border-light rounded-[10px] max-h-72 overflow-y-auto divide-y divide-border-light">
        {students.length === 0 ? (
          <p className="text-sm text-text-faint py-8 text-center">There are no student accounts yet.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-text-faint py-8 text-center">No student matches that search.</p>
        ) : shown.map(s => {
          const on = selected.has(s.id)
          return (
            <label
              key={s.id}
              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${on ? 'bg-primary-light/50' : 'hover:bg-surface-low'}`}
            >
              <input type="checkbox" className="w-4 h-4 accent-primary shrink-0" checked={on} onChange={() => toggle(s.id)} />
              <Avatar name={s.full_name} src={s.avatar_url} size="sm" className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-text truncate">{s.full_name}</span>
                <span className="block text-[11px] text-text-faint truncate">
                  {[s.student_id && `ID: ${s.student_id}`, s.department].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
