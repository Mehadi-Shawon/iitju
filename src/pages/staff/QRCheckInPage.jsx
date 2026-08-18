import { useState } from 'react'
import { useSearchParams, NavLink } from 'react-router-dom'
import { useMyStatus } from '@/hooks/useData'
import { PageHeader, StatusBadge, LoadingPage, Spinner } from '@/components/ui'
import { STATUS_VALUES } from '@/lib/staffStatus'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_LABELS = {
  available: 'Available',
  'in-class': 'In Class',
  'in-lab': 'In Lab',
  meeting: 'In Meeting',
  busy: 'Busy',
  'on-break': 'On Break',
  away: 'Away',
  'off-campus': 'Off Campus',
  'on-leave': 'On Leave',
  offline: 'Offline',
}

export default function QRCheckInPage() {
  const [params] = useSearchParams()
  const { status, loading, checkInViaQR } = useMyStatus()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  // Written into the QR by the admin generator. Anything not in STATUS_VALUES is
  // ignored rather than trusted — the URL is user-editable.
  const scannedLocation = (params.get('loc') ?? '').trim().slice(0, 80)
  const requested = params.get('st') ?? ''
  const scannedStatus = STATUS_VALUES.includes(requested) ? requested : 'available'
  const hasScan = scannedLocation.length > 0

  async function handleCheckIn(location, statusValue) {
    setSaving(true)
    const { error } = await checkInViaQR({ location, status: statusValue })
    setSaving(false)
    if (error) return toast.error('Check-in failed: ' + error.message)
    setDone({ location, status: statusValue })
    toast.success(location ? `Checked in at ${location}` : 'Checked in')
  }

  if (loading) return <LoadingPage />

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader
        title="Check In"
        subtitle={hasScan ? 'Confirm your check-in' : 'Scan the QR code posted in any room'}
      />

      {/* ── A room QR was scanned ── */}
      {hasScan && !done && (
        <div className="card p-6 text-center mb-4">
          <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>qr_code_scanner</span>
          </div>
          <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest mb-2">
            You scanned
          </div>
          <h2 className="text-2xl font-extrabold text-text tracking-tight leading-tight">
            {scannedLocation}
          </h2>
          <p className="text-sm text-text-muted mt-3">
            This will set your status to{' '}
            <strong className="text-text">{STATUS_LABELS[scannedStatus] ?? scannedStatus}</strong>
            {' '}and your location to <strong className="text-text">{scannedLocation}</strong>.
          </p>
          <button
            onClick={() => handleCheckIn(scannedLocation, scannedStatus)}
            className="btn-primary w-full mt-6"
            disabled={saving}
          >
            {saving
              ? <Spinner size={16} />
              : <span className="material-symbols-outlined" style={{ fontSize: 17 }}>login</span>}
            Check in here
          </button>
          <NavLink to="/app/staff/status" className="block text-xs text-text-faint hover:text-primary mt-3.5">
            Not right? Set your status manually instead
          </NavLink>
        </div>
      )}

      {/* ── Confirmed ── */}
      {done && (
        <div className="card p-6 text-center mb-4 border-green-200 bg-green-50">
          <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-white" style={{ fontSize: 28 }}>check</span>
          </div>
          <h2 className="text-xl font-extrabold text-green-900 tracking-tight">
            Checked in{done.location ? ` at ${done.location}` : ''}
          </h2>
          <p className="text-sm text-green-800 mt-1.5">
            Students now see you as {STATUS_LABELS[done.status] ?? done.status}.
          </p>
          <NavLink to="/app/dashboard" className="btn-secondary w-full mt-5">
            Back to Dashboard
          </NavLink>
        </div>
      )}

      {/* ── No scan: explain how it works ── */}
      {!hasScan && !done && (
        <div className="card p-6 mb-4">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>qr_code_2</span>
            </div>
            <div className="text-base font-bold text-text mb-1">Scan a room's QR code</div>
            <p className="text-sm text-text-muted leading-relaxed max-w-xs">
              Every classroom, lab and office has a printed FacultyTrack code. Point
              your phone camera at it and confirm once — your status and location
              update together.
            </p>
          </div>

          <ol className="mt-6 space-y-3">
            {[
              'Open your phone camera and point it at the code on the wall',
              'Tap the link that appears',
              'Confirm — you are checked in',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary-light text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-text-muted leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 pt-5 border-t border-border-light">
            <p className="text-xs text-text-faint mb-3">
              No code to hand? Check in without a room, or set your status yourself.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => handleCheckIn('', 'available')}
                className="btn-secondary flex-1"
                disabled={saving}
              >
                {saving ? <Spinner size={14} /> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>login</span>}
                Check in on campus
              </button>
              <NavLink to="/app/staff/status" className="btn-secondary flex-1">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>update</span>
                Update Status
              </NavLink>
            </div>
          </div>
        </div>
      )}

      {/* Current status, always visible for context */}
      <div className="card p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[10px] font-bold text-text-faint uppercase tracking-widest">Right now</span>
        <StatusBadge status={status?.status ?? 'offline'} />
        {status?.location && (
          <span className="flex items-center gap-1 text-xs text-text-muted font-medium">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span>
            {status.location}
          </span>
        )}
        {status?.updated_at && (
          <span className="text-xs text-text-faint">
            {formatDistanceToNow(new Date(status.updated_at), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  )
}
