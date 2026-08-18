import { useState, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useLocations, LOCATION_KINDS, LOCATION_STATUSES } from '@/hooks/useData'
import { PageHeader, EmptyState, LoadingPage, Modal, Spinner } from '@/components/ui'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_LABELS = {
  available: 'Available',
  'in-class': 'In Class',
  'in-lab': 'In Lab',
  meeting: 'In Meeting',
  busy: 'Busy',
  'on-break': 'On Break',
  away: 'Away',
}

const kindOf = k => LOCATION_KINDS.find(p => p.id === k) ?? LOCATION_KINDS[5]
const EMPTY = { name: '', kind: 'classroom', status: 'in-class' }

export default function AdminLocationQRPage() {
  const { locations, loading, setupNeeded, createLocation, updateLocation, deleteLocation } = useLocations()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState(null)     // room shown in the print panel
  const [editing, setEditing] = useState(null)   // room open in the edit dialog
  const [deleting, setDeleting] = useState(null) // room pending deletion
  const [search, setSearch] = useState('')

  // The QR encodes the row id, not the name — so renaming a room or changing
  // the status it sets takes effect on every sheet already printed for it.
  const checkInUrl = useMemo(() => {
    if (!active) return ''
    return `${window.location.origin}/app/staff/checkin?id=${active.id}`
  }, [active])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return locations
    return locations.filter(l =>
      l.name.toLowerCase().includes(q) || kindOf(l.kind).label.toLowerCase().includes(q))
  }, [locations, search])

  function pickKind(id, setter) {
    const k = LOCATION_KINDS.find(p => p.id === id)
    setter(f => ({ ...f, kind: id, status: k ? k.status : f.status }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Enter a room or location name')

    setSaving(true)
    const { data, error } = await createLocation(form)
    setSaving(false)

    if (error) {
      const dup = error.code === '23505' || /duplicate|unique/i.test(error.message ?? '')
      return toast.error(dup ? 'A room with that name already exists' : error.message)
    }
    setActive(data)
    setForm(EMPTY)
    toast.success('Room created')
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editing.name.trim()) return toast.error('Name cannot be empty')

    setSaving(true)
    const { error } = await updateLocation(editing.id, {
      name: editing.name, kind: editing.kind, status: editing.status, active: editing.active,
    })
    setSaving(false)

    if (error) {
      const dup = error.code === '23505' || /duplicate|unique/i.test(error.message ?? '')
      return toast.error(dup ? 'A room with that name already exists' : error.message)
    }
    if (active?.id === editing.id) setActive({ ...active, ...editing })
    setEditing(null)
    toast.success('Room updated - printed sheets now follow the new settings')
  }

  async function handleDelete() {
    setSaving(true)
    const { error } = await deleteLocation(deleting.id)
    setSaving(false)
    if (error) return toast.error(error.message)
    if (active?.id === deleting.id) setActive(null)
    setDeleting(null)
    toast.success('Room deleted - its printed codes no longer work')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(checkInUrl)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy - select the link and copy it manually')
    }
  }

  if (loading) return <LoadingPage />

  // The table is missing, so nothing on this page can work. Say what to do
  // rather than let every action fail with a raw PostgREST message.
  if (setupNeeded) {
    return (
      <div className="max-w-2xl">
        <PageHeader
          title="Location QR Codes"
          subtitle="One migration is needed before this page can be used"
        />
        <div className="card p-6">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-amber-700" style={{ fontSize: 22 }}>database</span>
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base text-text">The <code>locations</code> table does not exist yet</h2>
              <p className="text-sm text-text-muted mt-1.5 leading-relaxed">
                Rooms are stored in the database so their printed codes can be
                edited and retired later. Apply the migration, then reload this page.
              </p>
            </div>
          </div>

          <ol className="mt-6 space-y-3">
            {[
              <>Open your Supabase dashboard and go to <strong>SQL Editor -&gt; New query</strong>.</>,
              <>Paste the contents of <code className="text-xs">supabase/migrations/20260818_locations.sql</code> and run it.</>,
              <>Check the verification rows at the end all read <strong>OK</strong>.</>,
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
            <p className="text-xs text-text-faint leading-relaxed">
              Already ran it? Then the table exists but the API is still serving a
              cached schema. Run <code className="text-[11px]">NOTIFY pgrst, 'reload schema';</code> in
              the SQL Editor, then reload.
            </p>
            <button onClick={() => window.location.reload()} className="btn-secondary mt-4">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Location QR Codes"
          subtitle="Create a code for a room, print it, and post it inside. Faculty scan it to check in."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
        {/* ── Create + manage ── */}
        <div className="space-y-4 sm:space-y-5 no-print">
          <section className="card p-4 sm:p-6">
            <h2 className="font-bold text-base text-text mb-5">Add a Room</h2>
            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label className="form-label">Room / Location Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Class Room 310"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <KindPicker value={form.kind} onPick={id => pickKind(id, setForm)} />
              <StatusPicker
                value={form.status}
                onChange={v => setForm(f => ({ ...f, status: v }))}
              />
              <button type="submit" className="btn-primary w-full" disabled={saving}>
                {saving ? <Spinner size={16} />
                        : <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>}
                Create Room
              </button>
            </form>
          </section>

          <section className="card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-bold text-base text-text">
                Rooms {locations.length > 0 && <span className="text-text-faint font-medium">({locations.length})</span>}
              </h2>
            </div>

            {locations.length > 3 && (
              <div className="relative mb-3">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>search</span>
                <input
                  className="form-input pl-9"
                  placeholder="Search rooms..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}

            {shown.length === 0 ? (
              <p className="text-sm text-text-faint py-6 text-center">
                {locations.length === 0 ? 'No rooms yet. Add one above.' : 'No room matches that search.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {shown.map(l => (
                  <div
                    key={l.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border transition-all
                      ${active?.id === l.id ? 'border-primary bg-primary-light' : 'border-border-light bg-white'}
                      ${l.active ? '' : 'opacity-60'}`}
                  >
                    <button onClick={() => setActive(l)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <span className="material-symbols-outlined text-text-faint shrink-0" style={{ fontSize: 18 }}>
                        {kindOf(l.kind).icon}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-text truncate">{l.name}</span>
                          {!l.active && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface-low text-text-faint uppercase tracking-wide shrink-0">
                              Retired
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-text-faint">
                          {kindOf(l.kind).label} · sets {STATUS_LABELS[l.status] ?? l.status}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => setEditing({ ...l })}
                      title="Edit"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-low hover:text-primary transition-colors shrink-0"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button
                      onClick={() => setDeleting(l)}
                      title="Delete"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-text-faint mt-4 leading-relaxed">
              A code carries the room's identifier, not its name. Editing a room
              therefore changes what every sheet already printed for it does, and
              retiring or deleting one stops those sheets working.
            </p>
          </section>
        </div>

        {/* ── Printable sheet ── */}
        <section>
          {!active ? (
            <div className="card no-print">
              <EmptyState
                icon="qr_code_2"
                title="No room selected"
                description="Add a room, or pick one from the list, to preview and print its code."
              />
            </div>
          ) : (
            <>
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

              <div className="mt-4 space-y-3 no-print">
                {!active.active && (
                  <div className="card p-3 border-amber-200 bg-amber-50 text-xs text-amber-900">
                    This room is retired. Its codes are refused at check-in — reactivate it before printing.
                  </div>
                )}
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
                  {active.created_at && (
                    <div className="text-[11px] text-text-faint mt-2">
                      Created {format(new Date(active.created_at), 'd MMM yyyy')}
                      {active.updated_at && active.updated_at !== active.created_at &&
                        ` · edited ${format(new Date(active.updated_at), 'd MMM yyyy')}`}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── Edit dialog ── */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Room">
        {editing && (
          <form onSubmit={handleSaveEdit} className="space-y-5">
            <div className="text-xs text-text-muted bg-surface-low rounded-lg px-3 py-2.5 leading-relaxed">
              Changes apply to every sheet already printed for this room — the
              code points at the record, not at a copy of these values.
            </div>
            <div>
              <label className="form-label">Room / Location Name</label>
              <input
                className="form-input"
                value={editing.name}
                onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
              />
            </div>
            <KindPicker value={editing.kind} onPick={id => pickKind(id, setEditing)} />
            <StatusPicker value={editing.status} onChange={v => setEditing(e2 => ({ ...e2, status: v }))} />

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-current"
                checked={editing.active}
                onChange={e => setEditing(v => ({ ...v, active: e.target.checked }))}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-text">Active</span>
                <span className="block text-xs text-text-faint leading-relaxed">
                  Unchecking retires the room: its printed codes are refused at
                  check-in, but the record and its history are kept.
                </span>
              </span>
            </label>

            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>
                {saving ? <Spinner size={16} /> : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Delete confirmation ── */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Room">
        {deleting && (
          <div>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500" style={{ fontSize: 24 }}>delete</span>
            </div>
            <p className="text-sm text-text-muted text-center leading-relaxed">
              Delete <strong className="text-text">{deleting.name}</strong>? Any sheet
              already printed for it will stop working, and this cannot be undone.
            </p>
            <p className="text-xs text-text-faint text-center mt-3 leading-relaxed">
              To stop the codes working while keeping the record, edit the room and
              untick <strong>Active</strong> instead.
            </p>
            <div className="flex gap-2.5 mt-6">
              <button onClick={() => setDeleting(null)} className="btn-secondary flex-1">Cancel</button>
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

function KindPicker({ value, onPick }) {
  return (
    <div>
      <label className="form-label">Type</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {LOCATION_KINDS.map(k => {
          const on = value === k.id
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => onPick(k.id)}
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
  )
}

function StatusPicker({ value, onChange }) {
  return (
    <div>
      <label className="form-label">Scanning sets status to</label>
      <div className="relative">
        <select className="form-select pr-8" value={value} onChange={e => onChange(e.target.value)}>
          {LOCATION_STATUSES.map(v => (
            <option key={v} value={v}>{STATUS_LABELS[v] ?? v}</option>
          ))}
        </select>
        <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
      </div>
      <p className="text-[11px] text-text-faint mt-1.5">
        Suggested from the type. A room cannot set an absent state.
      </p>
    </div>
  )
}
