import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams, NavLink } from 'react-router-dom'
import { useMyStatus, fetchLocationById, isMissingTable } from '@/hooks/useData'
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

/**
 * Read the check-in parameters out of a scanned code or the current URL.
 *
 * Two forms exist. Current codes carry `?id=` — the identifier of a row in
 * `locations` — so that renaming a room, or retiring it, takes effect on sheets
 * already printed. Codes printed before the registry existed carry `?loc=` and
 * `?st=` directly; those are still honoured so old sheets keep working, but the
 * values they hold cannot be managed centrally.
 *
 * A code may have been generated against a different origin (a preview deploy,
 * or before a domain change), so the host is deliberately not checked.
 */
function readParams(source) {
  let params
  if (source instanceof URLSearchParams) {
    params = source
  } else {
    try {
      params = new URL(source).searchParams
    } catch {
      // Not a URL - accept a bare query string too
      if (!source.includes('id=') && !source.includes('loc=')) return null
      params = new URLSearchParams(source.replace(/^\?/, ''))
    }
  }

  const id = (params.get('id') ?? '').trim()
  if (id) return { kind: 'id', id }

  const location = (params.get('loc') ?? '').trim().slice(0, 80)
  if (!location) return null

  // Legacy form: the status rides in the URL, so validate it rather than trust
  // it — an edited link must not reach the database with an unknown value.
  const requested = params.get('st') ?? ''
  return {
    kind: 'legacy',
    location,
    status: STATUS_VALUES.includes(requested) ? requested : 'available',
  }
}

export default function QRCheckInPage() {
  const [params] = useSearchParams()
  const { status, loading, checkInViaQR } = useMyStatus()

  // Set either by the URL (the device camera opened the link) or by the in-app
  // scanner. Either way it ends at the same confirm card.
  const [pending, setPending] = useState(null)
  const [resolving, setResolving] = useState(() => !!(params.get('id') || params.get('loc')))

  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef(null)
  const handledRef = useRef(false)

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current
    scannerRef.current = null
    if (s) { try { await s.stop() } catch { /* already stopped */ } }
    setScanning(false)
  }, [])

  // Never leave the camera running behind us
  useEffect(() => () => { stopScanner() }, [stopScanner])

  async function startScanner() {
    if (scanning) return
    handledRef.current = false
    setDone(null)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      setScanning(true)
      const scanner = new Html5Qrcode('faculty-qr-reader')
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        async decoded => {
          // The callback fires at the scan rate while a code is in frame, so
          // stop before doing anything — otherwise one code spews toasts.
          if (handledRef.current) return
          handledRef.current = true
          await stopScanner()

          const { pending: p, error } = await resolve(readParams(decoded))
          if (error) {
            handledRef.current = false   // let them point at a different code
            return toast.error(error)
          }
          setPending(p)
        },
        () => {}   // per-frame decode misses are normal; ignore
      )
    } catch {
      setScanning(false)
      toast.error('Could not open the camera. Check permission, or use your phone camera on the printed code.')
    }
  }

  // Turns either code form into { location, status }. An id is looked up so the
  // room's CURRENT name and status are used, not whatever was true when the
  // sheet was printed; a retired or deleted room is refused.
  const resolve = useCallback(async parsed => {
    if (!parsed) return { error: 'That is not a FacultyTrack location code' }

    if (parsed.kind === 'legacy') {
      return { pending: { location: parsed.location, status: parsed.status } }
    }

    const { location, error } = await fetchLocationById(parsed.id)
    if (isMissingTable(error)) {
      return { error: 'Room codes are not set up yet. Ask an administrator to apply the locations migration.' }
    }
    if (error) return { error: 'Could not look up that room. Check your connection.' }
    if (!location) return { error: 'This code refers to a room that no longer exists.' }
    if (!location.active) return { error: `${location.name} is no longer an active check-in point.` }

    return { pending: { location: location.name, status: location.status } }
  }, [])

  // Resolve a code that arrived in the URL
  useEffect(() => {
    let cancelled = false
    const parsed = readParams(params)
    if (!parsed) { setResolving(false); return }

    resolve(parsed).then(({ pending: p, error }) => {
      if (cancelled) return
      setResolving(false)
      if (error) toast.error(error)
      else setPending(p)
    })
    return () => { cancelled = true }
  }, [params, resolve])

  async function handleCheckIn(location, statusValue) {
    setSaving(true)
    const { error } = await checkInViaQR({ location, status: statusValue })
    setSaving(false)
    if (error) return toast.error('Check-in failed: ' + error.message)
    setDone({ location, status: statusValue })
    setPending(null)
    toast.success(location ? `Checked in at ${location}` : 'Checked in')
  }

  if (loading || resolving) return <LoadingPage />

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader
        title="Check In"
        subtitle={pending ? 'Confirm your check-in' : 'Scan the QR code posted in any room'}
      />

      {/* ── Confirm a scanned room ── */}
      {pending && !done && (
        <div className="card p-6 text-center mb-4">
          <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>qr_code_scanner</span>
          </div>
          <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest mb-2">You scanned</div>
          <h2 className="text-2xl font-extrabold text-text tracking-tight leading-tight">{pending.location}</h2>
          <p className="text-sm text-text-muted mt-3">
            This will set your status to{' '}
            <strong className="text-text">{STATUS_LABELS[pending.status] ?? pending.status}</strong>.
          </p>
          <button
            onClick={() => handleCheckIn(pending.location, pending.status)}
            className="btn-primary w-full mt-6"
            disabled={saving}
          >
            {saving ? <Spinner size={16} />
                    : <span className="material-symbols-outlined" style={{ fontSize: 17 }}>login</span>}
            Check in here
          </button>
          <button onClick={() => setPending(null)} className="text-xs text-text-faint hover:text-text mt-3.5">
            Cancel
          </button>
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
          <div className="flex gap-2.5 mt-5">
            <button onClick={startScanner} className="btn-secondary flex-1">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>qr_code_scanner</span>
              Scan Another
            </button>
            <NavLink to="/app/dashboard" className="btn-secondary flex-1">Dashboard</NavLink>
          </div>
        </div>
      )}

      {/* ── Scanner ── */}
      {!pending && !done && (
        <div className="card p-5 sm:p-6 mb-4">
          <div
            id="faculty-qr-reader"
            className={`w-full rounded-[10px] overflow-hidden bg-black mb-4 ${scanning ? 'block' : 'hidden'}`}
            style={{ minHeight: 260 }}
          />

          {!scanning && (
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>qr_code_2</span>
              </div>
              <div className="text-base font-bold text-text mb-1">Scan a room's QR code</div>
              <p className="text-sm text-text-muted leading-relaxed max-w-xs">
                Every classroom, lab and office has a printed FacultyTrack code.
                Scan it here, or point your phone camera at it directly.
              </p>
            </div>
          )}

          {scanning ? (
            <button onClick={stopScanner} className="btn-danger w-full">
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>stop</span>
              Stop Camera
            </button>
          ) : (
            <button onClick={startScanner} className="btn-primary w-full">
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>photo_camera</span>
              Scan with Camera
            </button>
          )}
          <p className="text-[11px] text-text-faint mt-2.5 text-center">
            Requires camera permission. The site must be served over HTTPS.
          </p>

          <div className="mt-5 pt-5 border-t border-border-light">
            <p className="text-xs text-text-faint mb-3">No code to hand?</p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => handleCheckIn('', 'available')}
                className="btn-secondary flex-1"
                disabled={saving}
              >
                {saving ? <Spinner size={14} />
                        : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>login</span>}
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
