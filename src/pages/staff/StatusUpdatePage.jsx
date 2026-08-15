import { useState, useEffect } from 'react'
import { useMyStatus } from '@/hooks/useData'
import { PageHeader, LoadingPage, Spinner } from '@/components/ui'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

// Class strings are written out in full rather than composed, so Tailwind's
// scanner can see them. Colours match the badge-* / status-dot-* pairs in
// index.css so a status looks the same here as it does on the directory.
const STATUS_META = {
  available:    { label: 'Available',  icon: 'check_circle',    dot: 'bg-green-500',  tile: 'border-green-400 bg-green-50',   text: 'text-green-800',  ico: 'bg-green-500 text-white',  chip: 'bg-green-100 text-green-700' },
  'in-class':   { label: 'In Class',   icon: 'school',          dot: 'bg-purple-500', tile: 'border-purple-400 bg-purple-50', text: 'text-purple-800', ico: 'bg-purple-500 text-white', chip: 'bg-purple-100 text-purple-700' },
  'in-lab':     { label: 'In Lab',     icon: 'science',         dot: 'bg-indigo-500', tile: 'border-indigo-400 bg-indigo-50', text: 'text-indigo-800', ico: 'bg-indigo-500 text-white', chip: 'bg-indigo-100 text-indigo-700' },
  meeting:      { label: 'In Meeting', icon: 'groups',          dot: 'bg-blue-500',   tile: 'border-blue-400 bg-blue-50',     text: 'text-blue-800',   ico: 'bg-blue-500 text-white',   chip: 'bg-blue-100 text-blue-700' },
  busy:         { label: 'Busy',       icon: 'do_not_disturb_on', dot: 'bg-rose-500', tile: 'border-rose-400 bg-rose-50',     text: 'text-rose-800',   ico: 'bg-rose-500 text-white',   chip: 'bg-rose-100 text-rose-700' },
  'on-break':   { label: 'On Break',   icon: 'local_cafe',      dot: 'bg-yellow-500', tile: 'border-yellow-400 bg-yellow-50', text: 'text-yellow-800', ico: 'bg-yellow-500 text-white', chip: 'bg-yellow-100 text-yellow-700' },
  away:         { label: 'Away',       icon: 'directions_walk', dot: 'bg-amber-500',  tile: 'border-amber-400 bg-amber-50',   text: 'text-amber-800',  ico: 'bg-amber-500 text-white',  chip: 'bg-amber-100 text-amber-700' },
  'off-campus': { label: 'Off Campus', icon: 'home_work',       dot: 'bg-gray-400',   tile: 'border-gray-400 bg-gray-50',     text: 'text-gray-700',   ico: 'bg-gray-400 text-white',   chip: 'bg-gray-100 text-gray-600' },
  'on-leave':   { label: 'On Leave',   icon: 'luggage',         dot: 'bg-orange-400', tile: 'border-orange-400 bg-orange-50', text: 'text-orange-800', ico: 'bg-orange-400 text-white', chip: 'bg-orange-100 text-orange-700' },
  offline:      { label: 'Offline',    icon: 'power_settings_new', dot: 'bg-slate-400', tile: 'border-slate-400 bg-slate-50', text: 'text-slate-700',  ico: 'bg-slate-400 text-white',  chip: 'bg-slate-100 text-slate-500' },
}

// `cols` matches each group's item count on desktop so every row sits flush and
// no group ends with an orphan cell. Written as full class strings for Tailwind.
const STATUS_GROUPS = [
  { label: 'On campus, reachable', hint: 'Students may come to you',  cols: 'lg:grid-cols-4', values: ['available', 'in-class', 'in-lab', 'meeting'] },
  { label: 'On campus, occupied',  hint: 'Here, but not free',        cols: 'lg:grid-cols-3', values: ['busy', 'on-break', 'away'] },
  { label: 'Not on campus',        hint: 'Shown as unavailable',      cols: 'lg:grid-cols-3', values: ['off-campus', 'on-leave', 'offline'] },
]

const meta = v => STATUS_META[v] ?? STATUS_META.offline

export default function StatusUpdatePage() {
  const { status, loading, updateStatus } = useMyStatus()
  const [form, setForm] = useState({ status: 'available', location: '', note: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status) {
      setForm({ status: status.status, location: status.location ?? '', note: status.note ?? '' })
    }
  }, [status])

  const live = status?.status ?? 'offline'
  const liveMeta = meta(live)
  const pickedMeta = meta(form.status)
  const statusChanged = !!status && form.status !== live
  const dirty =
    !!status &&
    (statusChanged ||
      form.location !== (status.location ?? '') ||
      form.note !== (status.note ?? ''))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await updateStatus(form)
    setSaving(false)
    if (error) return toast.error('Failed to update: ' + error.message)
    toast.success(`You are now ${pickedMeta.label}`)
  }

  if (loading) return <LoadingPage />

  // Shared by the desktop and mobile save buttons so the two cannot drift
  const saveDisabled = saving || !dirty
  const saveLabel = dirty ? `Set to ${pickedMeta.label}` : 'Saved'
  const saveIcon = saving
    ? <Spinner size={16} />
    : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>

  return (
    <div className="max-w-3xl pb-24 sm:pb-4">
      <PageHeader
        title="Update Status"
        subtitle="This is exactly what students see on the faculty directory"
      />

      {/* ── What students can see right now ── */}
      <div className={`rounded-lg border shadow-sm p-4 sm:p-5 mb-4 sm:mb-5 ${liveMeta.tile}`}>
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${liveMeta.ico}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{liveMeta.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-faint mb-1">
              Live on the directory
            </div>
            <div className={`text-lg font-extrabold tracking-tight leading-none ${liveMeta.text}`}>
              {liveMeta.label}
            </div>
          </div>
          {status?.updated_at && (
            <div className="text-right shrink-0 hidden sm:block">
              <div className="text-[10px] font-bold uppercase tracking-widest text-text-faint mb-1">Updated</div>
              <div className="text-xs font-semibold text-text-muted leading-none">
                {formatDistanceToNow(new Date(status.updated_at), { addSuffix: true })}
              </div>
            </div>
          )}
        </div>

        {(status?.location || status?.note || status?.updated_at) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3.5 pt-3.5 border-t border-black/5">
            {status?.location && (
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${liveMeta.text}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>location_on</span>
                {status.location}
              </span>
            )}
            {status?.note && (
              <span className="flex items-center gap-1.5 text-xs text-text-muted italic min-w-0">
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: 15 }}>sticky_note_2</span>
                <span className="truncate">{status.note}</span>
              </span>
            )}
            {status?.updated_at && (
              <span className="flex items-center gap-1.5 text-xs text-text-faint sm:hidden">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
                {formatDistanceToNow(new Date(status.updated_at), { addSuffix: true })}
              </span>
            )}
          </div>
        )}
      </div>

      <form id="status-form" onSubmit={handleSubmit} className="space-y-4">
        {/* ── Pick a status ── */}
        <div className="card p-4 sm:p-6 space-y-6">
          {STATUS_GROUPS.map(group => (
            <div key={group.label}>
              <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <span className="text-[10px] font-bold text-text-faint uppercase tracking-widest">
                  {group.label}
                </span>
                <span className="text-[11px] text-text-faint hidden sm:block shrink-0">{group.hint}</span>
              </div>

              <div className={`grid grid-cols-1 sm:grid-cols-2 ${group.cols} gap-2.5`}>
                {group.values.map(value => {
                  const m = meta(value)
                  const active = form.status === value
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setForm(f => ({ ...f, status: value }))}
                      className={`h-14 w-full flex items-center gap-3 pl-3 pr-2.5 rounded-[10px] border transition-all duration-150 active:scale-[0.98]
                        ${active
                          ? `${m.tile} shadow-sm`
                          : 'border-border bg-white hover:border-text-faint/50 hover:bg-surface-low'}`}
                    >
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors
                        ${active ? m.ico : 'bg-surface-low text-text-faint'}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{m.icon}</span>
                      </span>
                      <span className={`flex-1 min-w-0 text-sm font-bold text-left truncate ${active ? m.text : 'text-text-muted'}`}>
                        {m.label}
                      </span>
                      <span className={`material-symbols-outlined shrink-0 transition-opacity ${active ? `${m.text} opacity-100` : 'opacity-0'}`} style={{ fontSize: 18 }}>
                        check_circle
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Details ── */}
        <div className="card p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ClearableInput
            label="Location"
            placeholder="e.g. Room 402, Library…"
            value={form.location}
            onChange={v => setForm(f => ({ ...f, location: v }))}
            icon="location_on"
          />
          <ClearableInput
            label="Note"
            optional
            placeholder="e.g. Back at 3 PM"
            value={form.note}
            onChange={v => setForm(f => ({ ...f, note: v }))}
            icon="sticky_note_2"
          />
          <p className="sm:col-span-2 text-[11px] text-text-faint -mt-1">
            Both are shown publicly on your directory card.
          </p>
        </div>
      </form>

      {/* Desktop: sits in the normal flow, flush with the left edge of the cards */}
      <div className="hidden sm:flex items-center gap-3 mt-4">
        <button type="submit" form="status-form" className="btn-primary px-8" disabled={saveDisabled}>
          {saveIcon}
          {saveLabel}
        </button>
        {statusChanged ? (
          <span className="flex items-center gap-1.5">
            <span className={`badge ${liveMeta.chip}`}>{liveMeta.label}</span>
            <span className="material-symbols-outlined text-text-faint" style={{ fontSize: 15 }}>arrow_forward</span>
            <span className={`badge ${pickedMeta.chip}`}>{pickedMeta.label}</span>
          </span>
        ) : dirty ? (
          <span className="text-xs text-text-faint">Unsaved changes</span>
        ) : null}
      </div>

      {/* Mobile: docked to the bottom, full width, always in thumb reach.
          The sidebar is off-canvas below lg, so full-bleed is correct here. */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 px-3 py-3 bg-white/95 backdrop-blur-md border-t border-border-light">
        <button type="submit" form="status-form" className="btn-primary w-full" disabled={saveDisabled}>
          {saveIcon}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

function ClearableInput({ label, optional, placeholder, value, onChange, icon }) {
  return (
    <div>
      <label className="form-label">
        {label} {optional && <span className="text-text-faint font-normal">(optional)</span>}
      </label>
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>
          {icon}
        </span>
        <input
          type="text"
          className="form-input pl-9 pr-9"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-text-faint hover:bg-surface-low hover:text-text transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        )}
      </div>
    </div>
  )
}
