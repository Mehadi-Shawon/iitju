import { useState, useMemo, useRef, useEffect } from 'react'
import { useStaffList, useSubmissions, groupSubmissionChains, useNotifications, MAX_SUBMISSION_BYTES } from '@/hooks/useData'
import { PageHeader, LoadingPage, EmptyState, formatBytes } from '@/components/ui'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  submitted:          { label: 'Submitted',      color: 'bg-blue-100 text-blue-700',   icon: 'upload_file' },
  under_review:       { label: 'Under Review',   color: 'bg-amber-100 text-amber-700', icon: 'rate_review' },
  approved:           { label: 'Approved',       color: 'bg-green-100 text-green-700',  icon: 'verified' },
  rejected:           { label: 'Denied',         color: 'bg-red-100 text-red-600',      icon: 'block' },
}

const DOC_TYPES = [
  { value: 'thesis',  label: 'Thesis',         icon: 'menu_book' },
  { value: 'project', label: 'Project Report', icon: 'folder_open' },
]

const EMPTY_FORM = { title: '', doc_type: 'thesis', abstract: '', staff_id: '' }

export default function ThesisSubmitPage() {
  const { staff, loading: staffLoading } = useStaffList()
  const { submissions, loading, submitWork, getFileUrl } = useSubmissions()
  const { markReadByType } = useNotifications()
  const [tab, setTab] = useState('new')
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [revisionOf, setRevisionOf] = useState(null) // submission being revised
  const fileRef = useRef(null)

  const chains = useMemo(() => groupSubmissionChains(submissions), [submissions])

  // Opening this page is viewing the review outcome, so clear its badge here
  // rather than only when the bell item is clicked.
  useEffect(() => {
    markReadByType(['submission_under_review', 'submission_approved', 'submission_rejected'])
  }, [markReadByType])

  function pickFile(selected) {
    if (!selected) return
    if (selected.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted')
      return
    }
    if (selected.size > MAX_SUBMISSION_BYTES) {
      toast.error(`File is too large (max ${MAX_SUBMISSION_BYTES / 1024 / 1024} MB)`)
      return
    }
    setFile(selected)
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setFile(null)
    setRevisionOf(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Prefill from the rejected / revision-requested version and lock the faculty
  function startRevision(latest) {
    setRevisionOf(latest)
    setForm({
      title: latest.title,
      doc_type: latest.doc_type,
      abstract: latest.abstract ?? '',
      staff_id: latest.staff_id,
    })
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setTab('new')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.staff_id) { toast.error('Please choose the faculty member to submit to'); return }
    if (!file) { toast.error('Please attach your PDF'); return }

    setSubmitting(true)
    const { error } = await submitWork({ ...form, file, previous: revisionOf })
    setSubmitting(false)

    if (error) {
      toast.error(error.message || 'Submission failed')
    } else {
      toast.success(revisionOf ? `Version ${revisionOf.version + 1} submitted!` : 'Submission sent!')
      resetForm()
      setTab('my')
    }
  }

  async function handleOpenFile(sub) {
    const { url, error } = await getFileUrl(sub.file_path)
    if (error || !url) toast.error('Could not open the file')
    else window.open(url, '_blank', 'noopener')
  }

  if (staffLoading || loading) return <LoadingPage />

  return (
    <div>
      <PageHeader
        title="Thesis & Project Submission"
        subtitle="Submit your thesis or project report as a PDF and track its review status"
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-low rounded-xl mb-5 sm:mb-6 w-fit">
        {[
          { id: 'new', label: revisionOf ? 'Resubmit' : 'New Submission' },
          { id: 'my',  label: `My Submissions${chains.length ? ` (${chains.length})` : ''}` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-150
              ${tab === t.id ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'new' ? (
        <div className="card p-5 sm:p-6 max-w-2xl">
          {revisionOf && (
            <div className="flex items-start gap-3 mb-5 p-3 rounded-xl bg-orange-50 border border-orange-200">
              <span className="material-symbols-outlined text-orange-600 shrink-0" style={{ fontSize: 20 }}>edit_note</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-orange-900">
                  Resubmitting as version {revisionOf.version + 1}
                </div>
                <div className="text-xs text-orange-800 mt-0.5">
                  Resubmitting "{revisionOf.title}" — it goes back to the same faculty member.
                </div>
                {revisionOf.feedback && (
                  <div className="text-xs text-orange-800 mt-1.5 italic">
                    Feedback: "{revisionOf.feedback}"
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-bold text-orange-700 hover:text-orange-900 shrink-0"
              >
                Cancel
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Document type */}
            <div>
              <label className="form-label">Document Type</label>
              <div className="grid grid-cols-2 gap-3">
                {DOC_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, doc_type: t.value }))}
                    className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-sm font-bold transition-all duration-150
                      ${form.doc_type === t.value
                        ? 'border-primary bg-primary-light text-primary shadow-sm'
                        : 'border-border-light text-text-muted hover:border-primary/40'}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. A QR-Based Faculty Availability Tracking System"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="form-label">Submit To <span className="text-red-500">*</span></label>
              <select
                className="form-input"
                value={form.staff_id}
                onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}
                disabled={!!revisionOf}
                required
              >
                <option value="">Select a faculty member…</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.honorific ? `${s.honorific} ${s.full_name}` : s.full_name}
                    {s.department ? ` — ${s.department}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-text-faint mt-1.5">
                {revisionOf
                  ? 'A resubmission always goes back to the same faculty member.'
                  : 'Only this faculty member will be able to see and review your submission.'}
              </p>
            </div>

            <div>
              <label className="form-label">Abstract / Notes</label>
              <textarea
                className="form-input min-h-[100px] resize-none"
                placeholder="Briefly describe your work, or add a note for your reviewer…"
                value={form.abstract}
                onChange={e => setForm(f => ({ ...f, abstract: e.target.value }))}
              />
            </div>

            {/* PDF picker */}
            <div>
              <label className="form-label">PDF File <span className="text-red-500">*</span></label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                id="submission-file"
                onChange={e => pickFile(e.target.files?.[0])}
              />
              <label
                htmlFor="submission-file"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]) }}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl border border-dashed cursor-pointer transition-all duration-150
                  ${file ? 'border-primary bg-primary-light' : 'border-border-light hover:border-primary/50 hover:bg-surface-low'}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${file ? 'bg-white text-primary' : 'bg-surface-low text-text-faint'}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {file ? 'picture_as_pdf' : 'upload_file'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  {file ? (
                    <>
                      <div className="text-sm font-bold text-text truncate">{file.name}</div>
                      <div className="text-xs text-text-muted">{formatBytes(file.size)} · tap to replace</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-text">Choose a PDF file</div>
                      <div className="text-xs text-text-faint">
                        PDF only · up to {MAX_SUBMISSION_BYTES / 1024 / 1024} MB
                      </div>
                    </>
                  )}
                </div>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={resetForm} className="btn-secondary flex-1">
                Clear
              </button>
              <button type="submit" disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Uploading…' : revisionOf ? `Submit v${revisionOf.version + 1}` : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* My Submissions */
        chains.length === 0 ? (
          <EmptyState
            icon="upload_file"
            title="No submissions yet"
            description="Go to New Submission to send your thesis or project report to a faculty member."
          />
        ) : (
          <div className="space-y-3">
            {chains.map(versions => (
              <SubmissionChainCard
                key={versions[0].parent_id ?? versions[0].id}
                versions={versions}
                onOpenFile={handleOpenFile}
                onRevise={startRevision}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}

function SubmissionChainCard({ versions, onOpenFile, onRevise }) {
  const [showHistory, setShowHistory] = useState(false)
  const latest = versions[0]
  const cfg = STATUS_CONFIG[latest.status] ?? STATUS_CONFIG.submitted
  const docType = DOC_TYPES.find(t => t.value === latest.doc_type) ?? DOC_TYPES[0]
  const staffName = latest.staff
    ? (latest.staff.honorific ? `${latest.staff.honorific} ${latest.staff.full_name}` : latest.staff.full_name)
    : '—'
  // A denied submission can be corrected and sent again as the next version
  const canRevise = latest.status === 'rejected'

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>{docType.icon}</span>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-text">{latest.title}</div>
            <div className="text-xs text-text-faint mt-0.5">
              {docType.label} · v{latest.version} · to {staffName}
            </div>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      {latest.abstract && (
        <div className="text-xs text-text-muted mb-3 bg-surface-low rounded-lg px-2.5 py-1.5 italic">
          "{latest.abstract}"
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => onOpenFile(latest)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary-light hover:brightness-95 transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>picture_as_pdf</span>
          {latest.file_name}
        </button>
        {latest.file_size != null && (
          <span className="text-[11px] text-text-faint">{formatBytes(latest.file_size)}</span>
        )}
      </div>

      {latest.feedback && (
        <div className={`text-xs rounded-lg px-2.5 py-2 mb-3 ${
          latest.status === 'approved' ? 'bg-green-50 text-green-800'
          : latest.status === 'rejected' ? 'bg-red-50 text-red-700'
          : 'bg-orange-50 text-orange-800'}`}>
          <span className="font-semibold">Faculty feedback: </span>{latest.feedback}
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
        {canRevise && (
          <button
            onClick={() => onRevise(latest)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors"
          >
            Resubmit
          </button>
        )}
      </div>

      {showHistory && versions.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border-light space-y-2">
          <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest">Submission History</div>
          {versions.map(v => {
            const vcfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.submitted
            return (
              <div key={v.id} className="flex items-start gap-2.5 text-xs">
                <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${vcfg.color}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{vcfg.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-text">v{v.version}</span>
                    <span className="text-text-muted">{vcfg.label}</span>
                    <button onClick={() => onOpenFile(v)} className="text-primary font-semibold hover:underline">
                      open PDF
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
          })}
        </div>
      )}
    </div>
  )
}
