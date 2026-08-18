import { useState, useEffect, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { PageHeader, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'

// The room type decides what status a scan sets, which is the point of the
// feature: one scan records both where the lecturer is and what they are doing.
const PLACE_KINDS = [
  { id: 'classroom', label: 'Classroom',    icon: 'school',       status: 'in-class' },
  { id: 'lab',       label: 'Lab',          icon: 'science',      status: 'in-lab' },
  { id: 'office',    label: 'Office',       icon: 'meeting_room', status: 'available' },
  { id: 'meeting',   label: 'Meeting Room', icon: 'groups',       status: 'meeting' },
  { id: 'library',   label: 'Library',      icon: 'local_library', status: 'available' },
  { id: 'other',     label: 'Other',        icon: 'location_on',  status: 'available' },
]

const STATUS_LABELS = {
  available: 'Available',
  'in-class': 'In Class',
  'in-lab': 'In Lab',
  meeting: 'In Meeting',
  busy: 'Busy',
  'on-break': 'On Break',
}

const STORE_KEY = 'facultytrack.locationQRs'

// Stored in this browser only — no database table, so nothing to migrate. The
// QR itself carries everything needed to check in; this list exists purely so an
// admin can reprint a code without retyping the room.
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

export default function AdminLocationQRPage() {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('classroom')
  const [status, setStatus] = useState('in-class')
  const [saved, setSaved] = useState(loadSaved)
  const [active, setActive] = useState(null)   // the location currently shown / printable

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)) } catch { /* quota — not fatal */ }
  }, [saved])

  // Changing the room type re-suggests its status, but an explicit choice sticks
  function pickKind(id) {
    setKind(id)
    const k = PLACE_KINDS.find(p => p.id === id)
    if (k) setStatus(k.status)
  }

  const checkInUrl = useMemo(() => {
    if (!active) return ''
    const base = `${window.location.origin}/app/staff/checkin`
    const q = new URLSearchParams({ loc: active.name, st: active.status })
    return `${base}?${q.toString()}`
  }, [active])

  function handleGenerate(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return toast.error('Enter a room or location name')

    const entry = { name: trimmed, kind, status, id: `${trimmed}::${status}` }
    setActive(entry)
    setSaved(prev => [entry, ...prev.filter(p => p.id !== entry.id)].slice(0, 24))
    setName('')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(checkInUrl)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy — select the link and copy manually')
    }
  }

  const kindOf = k => PLACE_KINDS.find(p => p.id === k) ?? PLACE_KINDS[5]

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Location QR Codes"
          subtitle="Generate a QR for a room, print it, and post it inside. Faculty scan it to check in."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
        {/* ── Generator ── */}
        <section className="card p-4 sm:p-6 no-print">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="form-label">Room / Location Name</label>
              <input
                className="form-input"
                placeholder="e.g. Class Room 310"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <p className="text-[11px] text-text-faint mt-1.5">
                Printed on the sheet, and shown as the faculty member's location.
              </p>
            </div>

            <div>
              <label className="form-label">Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PLACE_KINDS.map(k => {
                  const on = kind === k.id
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => pickKind(k.id)}
                      className={`h-12 flex items-center gap-2 px-3 rounded-[10px] border text-sm font-bold transition-all duration-150 active:scale-[0.98]
                        ${on ? 'border-primary bg-primary-light text-primary shadow-sm'
                             : 'border-border bg-white text-text-muted hover:border-text-faint/50 hover:bg-surface-low'}`}
                    >
                      <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18 }}>{k.icon}</span>
                      <span className="truncate">{k.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="form-label">Scanning sets status to</label>
              <div className="relative">
                <select className="form-select pr-8" value={status} onChange={e => setStatus(e.target.value)}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
              </div>
              <p className="text-[11px] text-text-faint mt-1.5">
                Suggested from the type — change it if this room is used differently.
              </p>
            </div>

            <button type="submit" className="btn-primary w-full">
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>qr_code_2</span>
              Generate QR
            </button>
          </form>

          {/* Reprint list */}
          <div className="mt-6 pt-5 border-t border-border-light">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-text-faint uppercase tracking-widest">
                Recently generated
              </span>
              {saved.length > 0 && (
                <button onClick={() => { setSaved([]); toast.success('List cleared') }}
                  className="text-[11px] font-bold text-text-faint hover:text-red-500 transition-colors">
                  Clear
                </button>
              )}
            </div>
            {saved.length === 0 ? (
              <p className="text-xs text-text-faint py-2">Nothing generated yet.</p>
            ) : (
              <div className="space-y-1.5">
                {saved.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border text-left transition-all
                      ${active?.id === s.id ? 'border-primary bg-primary-light' : 'border-border-light bg-white hover:bg-surface-low'}`}
                  >
                    <span className="material-symbols-outlined text-text-faint shrink-0" style={{ fontSize: 17 }}>
                      {kindOf(s.kind).icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-text truncate">{s.name}</span>
                      <span className="block text-[11px] text-text-faint">
                        {kindOf(s.kind).label} · sets {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    </span>
                    <span className="material-symbols-outlined text-text-faint shrink-0" style={{ fontSize: 16 }}>print</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-text-faint mt-3">
              This list is remembered in this browser only. The QR itself carries
              everything needed, so a printed sheet keeps working regardless.
            </p>
          </div>
        </section>

        {/* ── Preview / printable sheet ── */}
        <section>
          {!active ? (
            <div className="card no-print">
              <EmptyState
                icon="qr_code_2"
                title="No QR yet"
                description="Enter a room name and generate a code to preview and print it."
              />
            </div>
          ) : (
            <>
              {/* This block is what the printer gets */}
              <div className="card p-6 sm:p-8 print-sheet">
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-text-faint mb-2">
                    FacultyTrack · Check-In Point
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight leading-tight">
                    {active.name}
                  </h2>
                  <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-surface-low">
                    <span className="material-symbols-outlined text-text-muted" style={{ fontSize: 15 }}>
                      {kindOf(active.kind).icon}
                    </span>
                    <span className="text-xs font-bold text-text-muted">
                      Sets status to {STATUS_LABELS[active.status] ?? active.status}
                    </span>
                  </div>

                  <div className="flex justify-center my-7">
                    <div className="p-4 bg-white border border-border-light rounded-lg">
                      <QRCodeSVG value={checkInUrl} size={224} level="M" includeMargin />
                    </div>
                  </div>

                  <div className="text-base font-bold text-text">Faculty — scan to check in</div>
                  <p className="text-sm text-text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
                    Point your phone camera at this code. Confirm once, and your
                    status updates to <strong>{STATUS_LABELS[active.status] ?? active.status}</strong> at {active.name}.
                  </p>
                </div>
              </div>

              {/* Controls — never printed */}
              <div className="mt-4 space-y-3 no-print">
                <div className="flex gap-2.5">
                  <button onClick={() => window.print()} className="btn-primary flex-1">
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>print</span>
                    Print Sheet
                  </button>
                  <button onClick={copyLink} className="btn-secondary flex-1">
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>link</span>
                    Copy Link
                  </button>
                </div>
                <div className="card p-3">
                  <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest mb-1.5">
                    Encoded link
                  </div>
                  <div className="text-[11px] font-mono text-text-muted break-all leading-relaxed">
                    {checkInUrl}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
