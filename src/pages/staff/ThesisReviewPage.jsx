import { useState, useMemo, useEffect } from 'react'
import { useSubmissions, groupSubmissionChains, useNotifications } from '@/hooks/useData'
import { Avatar, PageHeader, LoadingPage, EmptyState, Modal, formatBytes } from '@/components/ui'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  submitted:          { label: 'Submitted',      color: 'bg-blue-100 text-blue-700',     icon: 'upload_file' },
  under_review:       { label: 'Under Review',   color: 'bg-amber-100 text-amber-700',   icon: 'rate_review' },
  approved:           { label: 'Approved',       color: 'bg-green-100 text-green-700',   icon: 'verified' },
  // DB value stays 'rejected'; the UI wording is "Denied"
  rejected:           { label: 'Denied',         color: 'bg-red-100 text-red-600',       icon: 'block' },
}

const DOC_TYPES = [
  { value: 'thesis',  label: 'Thesis',         icon: 'menu_book' },
  { value: 'project', label: 'Project Report', icon: 'folder_open' },
]

const OPEN_STATUSES = ['submitted', 'under_review']

const DECISION_TOAST = {
  approved:           'Submission approved',
  rejected:           'Submission denied',
}

// Matched against student name, student ID and submission title
function matchesSearch(versions, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const s = versions[0]
  return (s.student?.full_name ?? '').toLowerCase().includes(q)
    || (s.student?.student_id ?? '').toLowerCase().includes(q)
    || (s.student?.department ?? '').toLowerCase().includes(q)
    || (s.title ?? '').toLowerCase().includes(q)
}

export default function ThesisReviewPage() {
  const { submissions, loading, startReview, reviewSubmission, getFileUrl } = useSubmissions()
  const { markReadByType } = useNotifications()
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [reviewTarget, setReviewTarget] = useState(null)

  // Opening this page IS viewing the submissions, so clear their badge here.
  // Previously the dot only cleared by clicking the bell item, so arriving via
  // the sidebar left it showing.
  useEffect(() => { markReadByType(['submission_new']) }, [markReadByType])

  const chains = useMemo(() => groupSubmissionChains(submissions), [submissions])

  const filtered = useMemo(
    () => chains.filter(v => matchesSearch(v, search)),
    [chains, search]
  )
  const pending = filtered.filter(v => OPEN_STATUSES.includes(v[0].status))

  // Group chains by student for the per-student activity view
  const byStudent = useMemo(() => {
    const map = new Map()
    for (const versions of filtered) {
      const sid = versions[0].student_id
      if (!map.has(sid)) map.set(sid, { student: versions[0].student, chains: [] })
      map.get(sid).chains.push(versions)
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v }))
  }, [filtered])

  async function handleOpenFile(sub) {
    const { url, error } = await getFileUrl(sub.file_path)
    if (error || !url) toast.error('Could not open the file')
    else window.open(url, '_blank', 'noopener')
  }

  async function handleStartReview(sub) {
    const { error } = await startReview(sub.id)
    if (error) toast.error('Could not update status')
    else toast.success('Marked as under review')
  }

  async function handleReviewSubmit(values) {
    const { error } = await reviewSubmission(reviewTarget.id, values)
    if (error) {
      toast.error(error.message || 'Could not save the review')
    } else {
      toast.success(DECISION_TOAST[values.status] ?? 'Review saved')
      setReviewTarget(null)
    }
  }

  if (loading) return <LoadingPage />

  const displayed = tab === 'pending' ? pending : filtered
  const searching = search.trim().length > 0

  return (
    <div>
      <PageHeader
        title="Student Submissions"
        subtitle="Review thesis and project reports submitted to you"
      />

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 sm:mb-6">
        <div className="flex gap-1 p-1 bg-surface-low rounded-xl w-fit overflow-x-auto shrink-0">
          {[
            { id: 'pending', label: `To Review (${pending.length})` },
            { id: 'all',     label: `All (${filtered.length})` },
            { id: 'student', label: `By Student (${byStudent.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all duration-150
                ${tab === t.id ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>search</span>
          <input
            type="text"
            className="form-input pl-9 pr-9"
            placeholder="Search by student ID, name or title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {searching && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-text-faint hover:bg-surface-low hover:text-text transition-colors"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
        </div>
      </div>

      {tab === 'student' ? (
        byStudent.length === 0 ? (
          searching ? (
            <EmptyState
              icon="search_off"
              title="No match"
              description={`No student matches "${search.trim()}". Try an ID, a name, or part of a title.`}
            />
          ) : (
            <EmptyState icon="group" title="No students yet" description="Submissions will be grouped by student here." />
          )
        ) : (
          <div className="space-y-4">
            {byStudent.map(s => (
              <StudentActivityCard
                key={s.id}
                student={s.student}
                chains={s.chains}
                onOpenFile={handleOpenFile}
                onReview={setReviewTarget}
              />
            ))}
          </div>
        )
      ) : displayed.length === 0 ? (
        searching ? (
          <EmptyState
            icon="search_off"
            title="No match"
            description={`Nothing ${tab === 'pending' ? 'awaiting review ' : ''}matches "${search.trim()}". Try an ID, a name, or part of a title.`}
          />
        ) : (
          <EmptyState
            icon={tab === 'pending' ? 'inbox' : 'upload_file'}
            title={tab === 'pending' ? 'Nothing to review' : 'No submissions yet'}
            description={tab === 'pending' ? "You're all caught up!" : "Students haven't submitted anything to you yet."}
          />
        )
      ) : (
        <div className="space-y-3">
          {displayed.map(versions => (
            <ReviewCard
              key={versions[0].parent_id ?? versions[0].id}
              versions={versions}
              onOpenFile={handleOpenFile}
              onStartReview={handleStartReview}
              onReview={setReviewTarget}
            />
          ))}
        </div>
      )}

      <ReviewModal
        key={reviewTarget?.id ?? 'none'}
        submission={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onSubmit={handleReviewSubmit}
      />
    </div>
  )
}

function ReviewCard({ versions, onOpenFile, onStartReview, onReview }) {
  const [showHistory, setShowHistory] = useState(false)
  const latest = versions[0]
  const cfg = STATUS_CONFIG[latest.status] ?? STATUS_CONFIG.submitted
  const docType = DOC_TYPES.find(t => t.value === latest.doc_type) ?? DOC_TYPES[0]
  const studentName = latest.student?.full_name ?? '—'
  const isOpen = OPEN_STATUSES.includes(latest.status)

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={studentName} src={latest.student?.avatar_url} size="sm" />
          <div className="min-w-0">
            <div className="font-bold text-sm text-text truncate">{studentName}</div>
            <div className="text-xs text-text-faint">
              {latest.student?.student_id ? `ID: ${latest.student.student_id}` : latest.student?.department ?? '—'}
            </div>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex items-start gap-2 mb-1">
        <span className="material-symbols-outlined text-text-faint shrink-0" style={{ fontSize: 17 }}>{docType.icon}</span>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-text">{latest.title}</div>
          <div className="text-xs text-text-faint">{docType.label} · version {latest.version}</div>
        </div>
      </div>

      {latest.abstract && (
        <div className="text-xs text-text-muted my-3 bg-surface-low rounded-lg px-2.5 py-1.5 italic">
          "{latest.abstract}"
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 my-3">
        <button
          onClick={() => onOpenFile(latest)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary-light hover:brightness-95 transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>picture_as_pdf</span>
          Open PDF
        </button>
        <span className="text-[11px] text-text-faint truncate max-w-[180px]">{latest.file_name}</span>
        {latest.file_size != null && (
          <span className="text-[11px] text-text-faint">· {formatBytes(latest.file_size)}</span>
        )}
      </div>

      {latest.feedback && (
        <div className="text-xs text-text-muted rounded-lg px-2.5 py-2 mb-3 bg-surface-low">
          <span className="font-semibold">Your feedback: </span>{latest.feedback}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-text-faint">
          <span>{formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}</span>
          {versions.length > 1 && (
            <button
              onClick={() => setShowHistory(h => !h)}
              className="flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {showHistory ? 'expand_less' : 'history'}
              </span>
              {showHistory ? 'Hide history' : `${versions.length} versions`}
            </button>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          {latest.status === 'submitted' && (
            <button
              onClick={() => onStartReview(latest)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              Start Review
            </button>
          )}
          <button
            onClick={() => onReview(latest)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isOpen
                ? 'text-white bg-primary hover:brightness-110'
                : 'text-text-muted bg-surface-low hover:bg-border-light'
            }`}
          >
            {isOpen ? 'Review…' : 'Edit Review'}
          </button>
        </div>
      </div>

      {showHistory && versions.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border-light space-y-2">
          <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest">Submission History</div>
          {versions.map(v => (
            <VersionRow key={v.id} version={v} onOpenFile={onOpenFile} onReview={onReview} />
          ))}
        </div>
      )}
    </div>
  )
}

function VersionRow({ version: v, onOpenFile, onReview }) {
  const cfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.submitted
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${cfg.color}`}>
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{cfg.icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-bold text-text">v{v.version}</span>
          <span className="text-text-muted">{cfg.label}</span>
          <button onClick={() => onOpenFile(v)} className="text-primary font-semibold hover:underline">
            open PDF
          </button>
          <button onClick={() => onReview(v)} className="text-text-faint font-semibold hover:underline">
            edit review
          </button>
        </div>
        {v.feedback && <div className="text-text-muted mt-0.5 italic">"{v.feedback}"</div>}
        <div className="text-[10px] text-text-faint mt-0.5">
          Submitted {format(new Date(v.created_at), 'dd MMM yyyy, h:mm a')}
          {v.reviewed_at && ` · Reviewed ${format(new Date(v.reviewed_at), 'dd MMM yyyy, h:mm a')}`}
        </div>
      </div>
    </div>
  )
}

// Per-student roll-up — the student activity log on the faculty end
function StudentActivityCard({ student, chains, onOpenFile, onReview }) {
  const approved = chains.filter(v => v[0].status === 'approved').length
  const openCount = chains.filter(v => OPEN_STATUSES.includes(v[0].status)).length
  const totalVersions = chains.reduce((n, v) => n + v.length, 0)

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-3 pb-3 mb-3 border-b border-border-light">
        <Avatar name={student?.full_name} src={student?.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-text truncate">{student?.full_name ?? '—'}</div>
          <div className="text-xs text-text-faint">
            {student?.student_id ? `ID: ${student.student_id}` : student?.department ?? '—'}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-surface-low text-text-muted">
            {chains.length} {chains.length === 1 ? 'work' : 'works'} · {totalVersions} uploads
          </span>
          {openCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              {openCount} open
            </span>
          )}
          {approved > 0 && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">
              {approved} approved
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {chains.map(versions => (
          <div key={versions[0].parent_id ?? versions[0].id}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="material-symbols-outlined text-text-faint shrink-0" style={{ fontSize: 15 }}>
                {(DOC_TYPES.find(t => t.value === versions[0].doc_type) ?? DOC_TYPES[0]).icon}
              </span>
              <span className="text-xs font-bold text-text truncate">{versions[0].title}</span>
            </div>
            <div className="space-y-2 pl-1">
              {versions.map(v => (
                <VersionRow key={v.id} version={v} onOpenFile={onOpenFile} onReview={onReview} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Parent passes key={submission.id} so a fresh instance — and fresh form
// state — is mounted for each submission opened
function ReviewModal({ submission, onClose, onSubmit }) {
  const [values, setValues] = useState({
    title: submission?.title ?? '',
    doc_type: submission?.doc_type ?? 'thesis',
    feedback: submission?.feedback ?? '',
  })
  const [saving, setSaving] = useState(false)
  // false → the three decision buttons. true → the fields unlock for correction
  // before approving. "Edit & Approve" is what switches it on.
  const [editing, setEditing] = useState(false)

  if (!submission) return null

  const edited =
    values.title.trim() !== (submission.title ?? '').trim() ||
    values.doc_type !== submission.doc_type

  function cancelEdit() {
    setValues(v => ({ ...v, title: submission.title ?? '', doc_type: submission.doc_type }))
    setEditing(false)
  }

  async function decide(status) {
    if (!values.title.trim()) {
      toast.error('Title cannot be empty')
      return
    }
    if (status === 'rejected' && !values.feedback.trim()) {
      toast.error('Please add feedback explaining why it was denied')
      return
    }
    setSaving(true)
    await onSubmit({ ...values, title: values.title.trim(), status })
    setSaving(false)
  }

  return (
    <Modal open onClose={onClose} title={`Review v${submission.version}`} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-border-light">
          <Avatar name={submission.student?.full_name} src={submission.student?.avatar_url} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-text truncate">{submission.student?.full_name ?? '—'}</div>
            <div className="text-xs text-text-faint">
              {submission.student?.student_id ? `ID: ${submission.student.student_id}` : '—'}
              {' · '}Submitted {format(new Date(submission.created_at), 'dd MMM yyyy')}
            </div>
          </div>
        </div>

        {editing && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary-light border border-primary/25">
            <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: 19 }}>edit</span>
            <div className="text-xs text-primary font-semibold leading-relaxed">
              Correct the title or document type below, then save and approve in one step.
            </div>
          </div>
        )}

        <div>
          <label className="form-label">
            Title {editing && <span className="text-[10px] font-normal text-primary">editing</span>}
          </label>
          <input
            type="text"
            className={`form-input ${editing ? '' : 'bg-surface-low text-text-muted cursor-default'}`}
            value={values.title}
            readOnly={!editing}
            onChange={e => setValues(v => ({ ...v, title: e.target.value }))}
          />
        </div>

        <div>
          <label className="form-label">Document Type</label>
          <select
            className={`form-input ${editing ? '' : 'bg-surface-low text-text-muted cursor-default'}`}
            value={values.doc_type}
            disabled={!editing}
            onChange={e => setValues(v => ({ ...v, doc_type: e.target.value }))}
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">
            Feedback <span className="text-[10px] font-normal text-text-faint">(required to deny)</span>
          </label>
          <textarea
            className="form-input min-h-[110px] resize-none"
            placeholder="Comments, required corrections, or approval remarks…"
            value={values.feedback}
            onChange={e => setValues(v => ({ ...v, feedback: e.target.value }))}
          />
        </div>

        {editing ? (
          <>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button onClick={cancelEdit} disabled={saving} className="btn-secondary flex-1">
                Cancel Edit
              </button>
              <button onClick={() => decide('approved')} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save & Approve'}
              </button>
            </div>
            <p className="text-[11px] text-text-faint text-center">
              {edited
                ? 'Your corrections will be saved together with the approval.'
                : 'Change the title or type above, or cancel to go back.'}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button onClick={() => decide('rejected')} disabled={saving} className="btn-danger flex-1">
                Deny
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-primary bg-primary-light hover:brightness-95 transition-all disabled:opacity-50"
              >
                Edit &amp; Approve
              </button>
              <button onClick={() => decide('approved')} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Approve'}
              </button>
            </div>
            <p className="text-[11px] text-text-faint text-center">
              Approve accepts it as submitted · Edit &amp; Approve lets you correct the title or type first
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
