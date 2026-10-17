import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAnnouncements, useAnnouncementGroups } from '@/hooks/useData'
import { AudienceBadge, PageHeader, LoadingPage, EmptyState, Modal, Spinner } from '@/components/ui'
import AnnouncementInbox from '@/components/shared/AnnouncementInbox'
import toast from 'react-hot-toast'

// `target` is 'all' or a classroom id. If the chosen classroom is deleted it
// matches nothing, and the teacher has to choose again rather than the post
// quietly falling back to every student.
const EMPTY_DRAFT = { target: 'all', title: '', body: '' }
const TITLE_MAX = 200
const BODY_MAX = 5000

const plural = n => `${n} ${n === 1 ? 'student' : 'students'}`

export default function FacultyAnnouncementsPage() {
  const { announcements, loading, setupNeeded, postAnnouncement, updateAnnouncement, deleteAnnouncement } = useAnnouncements()
  // Classrooms are created and edited on the Classrooms page; here they are
  // only who an announcement can go to
  const { groups, students, loading: groupsLoading } = useAnnouncementGroups()

  const [composing, setComposing] = useState(false)
  // Kept while the dialog is closed, so closing it by accident loses nothing
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [posting, setPosting] = useState(false)
  const [openId, setOpenId] = useState(null)     // a just-posted announcement, opened in the reader
  const [editing, setEditing] = useState(null)   // announcement open in the edit dialog
  const [deleting, setDeleting] = useState(null) // announcement pending deletion
  const [saving, setSaving] = useState(false)

  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students])
  const membersOf = g => g.memberIds.map(id => studentMap.get(id)).filter(Boolean)

  const targetGroup = draft.target === 'all' ? null : groups.find(g => g.id === draft.target) ?? null
  const targetValid = draft.target === 'all' || targetGroup !== null

  async function handlePost(e) {
    e.preventDefault()
    const title = draft.title.trim()
    const body = draft.body.trim()
    if (!targetValid) return toast.error('Choose who to send this to')
    if (!title) return toast.error('Add a topic')
    if (!body) return toast.error('Write a message')
    if (targetGroup && membersOf(targetGroup).length === 0) {
      return toast.error(`${targetGroup.name} has no students yet`)
    }

    setPosting(true)
    const { data, error } = await postAnnouncement({ title, body, group_id: targetGroup?.id ?? null })
    setPosting(false)
    if (error) return toast.error(error.message || 'Could not post the announcement')

    toast.success(targetGroup ? `Posted to ${targetGroup.name}` : 'Posted to all students')
    // Keep the audience: resetting it to everyone would put the next notice
    // meant for a classroom one click away from going to every student
    setDraft(d => ({ ...EMPTY_DRAFT, target: d.target }))
    setComposing(false)
    setOpenId(data.id)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    const title = editing.title.trim()
    const body = editing.body.trim()
    if (!title || !body) return toast.error('The topic and message cannot be empty')

    const original = announcements.find(a => a.id === editing.id)
    if (original && original.title === title && original.body === body) {
      setEditing(null)
      return toast.success('No changes to save')
    }

    setSaving(true)
    const { error } = await updateAnnouncement(editing.id, { title, body })
    setSaving(false)
    if (error) return toast.error(error.message || 'Could not save the changes')
    setEditing(null)
    toast.success('Announcement updated')
  }

  async function handleDelete() {
    setSaving(true)
    const { error } = await deleteAnnouncement(deleting.id)
    setSaving(false)
    if (error) return toast.error(error.message || 'Could not delete the announcement')
    setDeleting(null)
    toast.success('Announcement deleted')
  }

  if (loading || groupsLoading) return <LoadingPage variant="inbox" />

  if (setupNeeded) {
    return (
      <div>
        <PageHeader title="Announcements" subtitle="Post to all students or to one of your classrooms" />
        <div className="card">
          <EmptyState
            icon="database"
            title="Announcements are not set up yet"
            description="Apply supabase/migrations/20261017_announcements.sql in the Supabase SQL Editor, then reload this page."
          />
        </div>
      </div>
    )
  }

  const hint = draft.target === 'all'
    ? { warn: students.length === 0, text: students.length
        ? `Every student (${students.length}) will see this and get a notification.`
        : 'There are no student accounts yet.' }
    : !targetGroup
      ? { warn: true, text: 'Choose who to send this to.' }
      : membersOf(targetGroup).length === 0
        ? { warn: true, text: `${targetGroup.name} has no students yet. Add some on the Classrooms page first.` }
        : { warn: false, text: `Only the ${plural(membersOf(targetGroup).length)} in ${targetGroup.name} will see this and get a notification.` }

  const newButton = (
    <button className="btn-primary" onClick={() => setComposing(true)}>
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit_square</span>
      New announcement
    </button>
  )

  return (
    <div>
      <PageHeader title="Announcements" subtitle="Post to all students or to one of your classrooms" action={newButton} />

      <AnnouncementInbox
        announcements={announcements}
        openId={openId}
        actions={a => (
          <>
            <button
              onClick={() => setEditing({ ...a })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-text-muted bg-surface-low hover:bg-border-light transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
              Edit
            </button>
            <button
              onClick={() => setDeleting(a)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
              Delete
            </button>
          </>
        )}
        emptyState={
          <div className="flex flex-col items-center text-center px-6 py-16 sm:py-20">
            <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>campaign</span>
            </div>
            <div className="text-base font-bold text-text">No announcements yet</div>
            <p className="text-sm text-text-faint mt-1 max-w-xs">
              Post one to every student, or to a single classroom. It appears here, where you can edit or delete it.
            </p>
            <div className="mt-5">{newButton}</div>
          </div>
        }
      />

      {/* ── New announcement ── */}
      <Modal open={composing} onClose={() => { if (!posting) setComposing(false) }} title="New Announcement" wide>
        <form onSubmit={handlePost} className="space-y-5">
          <div>
            <label className="form-label">To</label>
            <div className="relative">
              <select
                className="form-select pr-9"
                value={targetValid ? draft.target : ''}
                onChange={e => setDraft(d => ({ ...d, target: e.target.value }))}
              >
                {!targetValid && <option value="" disabled>Choose who to send this to</option>}
                <option value="all">All students</option>
                {groups.length > 0 && (
                  <optgroup label="Your classrooms">
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} · {plural(membersOf(g).length)}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
            </div>
            <p className={`text-[11px] mt-1.5 leading-relaxed ${hint.warn ? 'text-amber-700' : 'text-text-faint'}`}>{hint.text}</p>
            {groups.length === 0 && (
              <Link to="/app/staff/classrooms" className="inline-block mt-1 text-xs font-semibold text-primary hover:underline">
                Create a classroom to announce to particular students
              </Link>
            )}
          </div>

          <PostFields
            title={draft.title}
            body={draft.body}
            onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          />

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={() => setComposing(false)} className="btn-secondary flex-1" disabled={posting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 whitespace-nowrap" disabled={posting}>
              {posting ? <Spinner size={16} />
                       : <span className="material-symbols-outlined" style={{ fontSize: 17 }}>campaign</span>}
              {/* The full label wraps beside Cancel on a phone */}
              <span className="sm:hidden">Post</span>
              <span className="hidden sm:inline">Post Announcement</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Edit ── */}
      <Modal open={!!editing} onClose={() => { if (!saving) setEditing(null) }} title="Edit Announcement" wide>
        {editing && (
          <form onSubmit={handleSaveEdit} className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap text-xs font-semibold text-text-muted">
              Sent to <AudienceBadge announcement={editing} />
            </div>
            <PostFields
              title={editing.title}
              body={editing.body}
              onChange={patch => setEditing(v => ({ ...v, ...patch }))}
            />
            <div className="text-xs text-text-muted bg-surface-low rounded-lg px-3 py-2.5 leading-relaxed">
              Students see the new wording, marked as edited. They are not notified
              again, and who it was sent to cannot be changed.
            </div>
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1" disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>
                {saving ? <Spinner size={16} /> : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Delete ── */}
      <Modal open={!!deleting} onClose={() => { if (!saving) setDeleting(null) }} title="Delete Announcement">
        {deleting && (
          <div>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500" style={{ fontSize: 24 }}>delete</span>
            </div>
            <p className="text-sm text-text-muted text-center leading-relaxed break-words">
              Delete <strong className="text-text">{deleting.title}</strong>? It disappears for
              every student it was sent to, along with its notification. This cannot be undone.
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

// Topic and message, shared by the new and edit dialogs
function PostFields({ title, body, onChange }) {
  const nearLimit = body.length > BODY_MAX * 0.9
  return (
    <>
      <div>
        <label className="form-label">Topic</label>
        <input
          className="form-input"
          maxLength={TITLE_MAX}
          placeholder="e.g. Mid-term exam schedule"
          value={title}
          onChange={e => onChange({ title: e.target.value })}
        />
      </div>
      <div>
        <label className="form-label">Message</label>
        <textarea
          className="form-input min-h-[180px] py-2.5 resize-none"
          maxLength={BODY_MAX}
          placeholder="Write your announcement…"
          value={body}
          onChange={e => onChange({ body: e.target.value })}
        />
        <div className={`text-[11px] text-right mt-1 ${nearLimit ? 'text-amber-700' : 'text-text-faint'}`}>
          {body.length.toLocaleString('en-US')} / {BODY_MAX.toLocaleString('en-US')}
        </div>
      </div>
    </>
  )
}
