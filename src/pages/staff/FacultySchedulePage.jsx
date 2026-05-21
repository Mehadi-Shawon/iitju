import { useState } from 'react'
import { useScheduleRequests } from '@/hooks/useData'
import { Avatar, PageHeader, LoadingPage, EmptyState } from '@/components/ui'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700' },
  accepted:  { label: 'Accepted',  color: 'bg-green-100 text-green-700' },
  declined:  { label: 'Declined',  color: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
}

export default function FacultySchedulePage() {
  const { requests, loading, respondToRequest } = useScheduleRequests()
  const [tab, setTab] = useState('pending')
  const [declineTarget, setDeclineTarget] = useState(null) // request id
  const [declineNote, setDeclineNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const pending = requests.filter(r => r.status === 'pending')
  const displayed = tab === 'pending' ? pending : requests

  async function handleAccept(id) {
    const { error } = await respondToRequest(id, 'accepted', '')
    if (error) toast.error('Failed to accept request')
    else toast.success('Request accepted')
  }

  async function handleDeclineConfirm() {
    if (!declineTarget) return
    setSubmitting(true)
    const { error } = await respondToRequest(declineTarget, 'declined', declineNote)
    setSubmitting(false)
    if (error) {
      toast.error('Failed to decline request')
    } else {
      toast.success('Request declined')
      setDeclineTarget(null)
      setDeclineNote('')
    }
  }

  if (loading) return <LoadingPage />

  return (
    <div>
      <PageHeader
        title="Schedule Requests"
        subtitle="Manage incoming meeting requests from students"
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-low rounded-xl mb-5 sm:mb-6 w-fit">
        {[
          { id: 'pending', label: `Pending (${pending.length})` },
          { id: 'all',     label: 'All Requests' },
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

      {displayed.length === 0 ? (
        <EmptyState
          icon={tab === 'pending' ? 'inbox' : 'event_busy'}
          title={tab === 'pending' ? 'No pending requests' : 'No requests yet'}
          description={tab === 'pending' ? "You're all caught up!" : "Students haven't sent any requests yet."}
        />
      ) : (
        <div className="space-y-3">
          {displayed.map(req => (
            <FacultyRequestCard
              key={req.id}
              request={req}
              onAccept={() => handleAccept(req.id)}
              onDecline={() => { setDeclineTarget(req.id); setDeclineNote('') }}
            />
          ))}
        </div>
      )}

      {/* Decline confirmation modal */}
      {declineTarget && (
        <div className="fixed inset-0 bg-text/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
            <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500" style={{ fontSize: 22 }}>event_busy</span>
            </div>
            <h3 className="text-base font-extrabold text-text mb-1 text-center">Decline Request</h3>
            <p className="text-sm text-text-muted mb-4 text-center">Optionally add a note to explain the reason.</p>
            <textarea
              className="form-input min-h-[80px] resize-none mb-4"
              placeholder="Reason for declining (optional)..."
              value={declineNote}
              onChange={e => setDeclineNote(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setDeclineTarget(null)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeclineConfirm}
                disabled={submitting}
                className="flex-1 btn-danger"
              >
                {submitting ? 'Declining…' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FacultyRequestCard({ request: req, onAccept, onDecline }) {
  const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending
  const studentName = req.student?.full_name ?? '—'

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Avatar name={studentName} src={req.student?.avatar_url} size="sm" />
          <div>
            <div className="font-bold text-sm text-text">{studentName}</div>
            <div className="text-xs text-text-faint">
              {req.student?.student_id ? `ID: ${req.student.student_id}` : req.student?.department ?? '—'}
            </div>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      <div className="font-semibold text-sm text-text mb-1">{req.subject}</div>
      {req.message && (
        <div className="text-xs text-text-muted mb-3 bg-surface-low rounded-lg px-2.5 py-1.5 italic">
          "{req.message}"
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-faint mb-3">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>calendar_today</span>
          {req.preferred_date ? format(new Date(req.preferred_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
          {req.preferred_time ? req.preferred_time.slice(0, 5) : '—'}
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>timelapse</span>
          {req.duration_mins} min
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-faint">
          {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
        </span>
        {req.status === 'pending' && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onDecline}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
            >
              Accept
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
