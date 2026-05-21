import { useState } from 'react'
import { useStaffList, useScheduleRequests } from '@/hooks/useData'
import { Avatar, StatusBadge, PageHeader, LoadingPage, EmptyState } from '@/components/ui'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700' },
  accepted:  { label: 'Accepted',  color: 'bg-green-100 text-green-700' },
  declined:  { label: 'Declined',  color: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
}

const DURATIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
]

const TODAY = new Date().toISOString().split('T')[0]

export default function ScheduleRequestPage() {
  const { staff, loading: staffLoading } = useStaffList()
  const { requests, loading: reqLoading, submitRequest, cancelRequest } = useScheduleRequests()
  const [tab, setTab] = useState('new')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ subject: '', message: '', preferred_date: '', preferred_time: '', duration_mins: 30 })
  const [submitting, setSubmitting] = useState(false)

  const filtered = staff.filter(s =>
    !search ||
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.department?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selected) return
    setSubmitting(true)
    const { error } = await submitRequest({ staff_id: selected.id, ...form })
    setSubmitting(false)
    if (error) {
      toast.error(error.message || 'Failed to submit request')
    } else {
      toast.success('Schedule request sent!')
      setForm({ subject: '', message: '', preferred_date: '', preferred_time: '', duration_mins: 30 })
      setSelected(null)
      setTab('my')
    }
  }

  async function handleCancel(id) {
    const { error } = await cancelRequest(id)
    if (error) toast.error('Failed to cancel request')
    else toast.success('Request cancelled')
  }

  if (staffLoading || reqLoading) return <LoadingPage />

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div>
      <PageHeader
        title="Request Schedule"
        subtitle="Request a meeting appointment with a faculty member"
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-low rounded-xl mb-5 sm:mb-6 w-fit">
        {[
          { id: 'new', label: 'New Request' },
          { id: 'my',  label: `My Requests${requests.length ? ` (${requests.length})` : ''}` },
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
        <>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Faculty picker — full width on mobile, 2 cols on desktop */}
            <div className="lg:col-span-2 space-y-3">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>search</span>
                <input
                  type="text"
                  className="form-input pl-9"
                  placeholder="Search faculty..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                {filtered.length === 0 ? (
                  <EmptyState icon="search_off" title="No faculty found" description="Try a different search term." />
                ) : filtered.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelected(prev => prev?.id === s.id ? null : s)}
                    className={`w-full text-left card px-3.5 py-3 flex items-center gap-3 transition-all duration-150
                      ${selected?.id === s.id
                        ? 'border-primary bg-primary-light shadow'
                        : 'hover:border-primary/40 hover:shadow-sm'}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar name={s.full_name} src={s.avatar_url} size="sm" />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white status-dot status-dot-${s.status}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-text truncate">
                        {s.honorific ? `${s.honorific} ${s.full_name}` : s.full_name}
                      </div>
                      <div className="text-xs text-text-faint truncate">{s.department ?? '—'}</div>
                      <div className="mt-1"><StatusBadge status={s.status} /></div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop right panel — hidden on mobile */}
            <div className="hidden lg:block lg:col-span-3">
              {selected ? (
                <div className="card p-5 sm:p-6">
                  <SelectedFacultyHeader faculty={selected} />
                  <RequestForm
                    form={form} setForm={setForm}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    onClear={() => setSelected(null)}
                  />
                </div>
              ) : (
                <div className="card p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[300px]">
                  <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>calendar_add_on</span>
                  </div>
                  <div>
                    <div className="font-bold text-text mb-1">Select a Faculty Member</div>
                    <div className="text-sm text-text-muted">Choose from the list on the left to send a schedule request</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile bottom-sheet modal — shown only on mobile when a faculty is selected */}
          {selected && (
            <div className="fixed inset-0 z-50 flex items-end lg:hidden">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setSelected(null)}
              />
              {/* Sheet */}
              <div className="relative w-full bg-white rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-gray-200" />
                </div>
                {/* Sheet header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-light shrink-0">
                  <SelectedFacultyHeader faculty={selected} compact />
                  <button
                    onClick={() => setSelected(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-low text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors ml-3 shrink-0"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                  </button>
                </div>
                {/* Scrollable form body */}
                <div className="overflow-y-auto flex-1 px-5 py-4">
                  <RequestForm
                    form={form} setForm={setForm}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    onClear={() => setSelected(null)}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* My Requests tab */
        <div>
          {requests.length === 0 ? (
            <EmptyState
              icon="event_busy"
              title="No requests yet"
              description="Go to New Request to send your first schedule request to a faculty member."
            />
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <StudentRequestCard key={req.id} request={req} onCancel={handleCancel} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SelectedFacultyHeader({ faculty: s, compact = false }) {
  const name = s.honorific ? `${s.honorific} ${s.full_name}` : s.full_name
  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'mb-5 pb-4 border-b border-border-light'}`}>
      <Avatar name={s.full_name} src={s.avatar_url} size={compact ? 'sm' : 'md'} />
      <div>
        <div className={`font-bold text-text ${compact ? 'text-sm' : ''}`}>{name}</div>
        <div className="text-xs text-text-faint">{s.department}</div>
        {!compact && <div className="mt-1"><StatusBadge status={s.status} /></div>}
      </div>
    </div>
  )
}

function RequestForm({ form, setForm, submitting, onSubmit, onClear }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="form-label">Subject <span className="text-red-500">*</span></label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. Project discussion, Thesis review..."
          value={form.subject}
          onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Preferred Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            className="form-input"
            min={TODAY}
            value={form.preferred_date}
            onChange={e => setForm(f => ({ ...f, preferred_date: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="form-label">Preferred Time <span className="text-red-500">*</span></label>
          <input
            type="time"
            className="form-input"
            value={form.preferred_time}
            onChange={e => setForm(f => ({ ...f, preferred_time: e.target.value }))}
            required
          />
        </div>
      </div>

      <div>
        <label className="form-label">Duration</label>
        <select
          className="form-input"
          value={form.duration_mins}
          onChange={e => setForm(f => ({ ...f, duration_mins: Number(e.target.value) }))}
        >
          {DURATIONS.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label">Message</label>
        <textarea
          className="form-input min-h-[90px] resize-none"
          placeholder="Briefly describe the purpose of the meeting..."
          value={form.message}
          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClear} className="btn-secondary flex-1">
          Clear
        </button>
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? 'Sending…' : 'Send Request'}
        </button>
      </div>
    </form>
  )
}

function StudentRequestCard({ request: req, onCancel }) {
  const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending
  const staffName = req.staff
    ? (req.staff.honorific ? `${req.staff.honorific} ${req.staff.full_name}` : req.staff.full_name)
    : '—'

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Avatar name={req.staff?.full_name} src={req.staff?.avatar_url} size="sm" />
          <div>
            <div className="font-bold text-sm text-text">{staffName}</div>
            <div className="text-xs text-text-faint">{req.staff?.department ?? '—'}</div>
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

      {req.staff_note && (
        <div className={`text-xs rounded-lg px-2.5 py-1.5 mb-3 ${req.status === 'accepted' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          <span className="font-semibold">Faculty note: </span>{req.staff_note}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-text-faint">
        <span>{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</span>
        {req.status === 'pending' && (
          <button
            onClick={() => onCancel(req.id)}
            className="text-red-500 font-semibold hover:text-red-700 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
