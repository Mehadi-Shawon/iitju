import { useState, useEffect, useRef } from 'react'

// ── usePresence ──────────────────────────────────────────────
// Keeps something mounted after `open` turns false, for as long as its exit
// animation runs; `closing` is true during that time.
export function usePresence(open, exitMs = 180) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) { setMounted(true); return }
    const t = setTimeout(() => setMounted(false), exitMs)
    return () => clearTimeout(t)
  }, [open, exitMs])
  return { mounted: open || mounted, closing: !open && mounted }
}

// ── StatusBadge ──────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    available:    { label: 'Available',   cls: 'badge-available' },
    meeting:      { label: 'In Meeting',  cls: 'badge-meeting' },
    away:         { label: 'Away',        cls: 'badge-away' },
    offline:      { label: 'Offline',     cls: 'badge-offline' },
    'in-class':   { label: 'In Class',    cls: 'badge-in-class' },
    'in-lab':     { label: 'In Lab',      cls: 'badge-in-lab' },
    'on-break':   { label: 'On Break',    cls: 'badge-on-break' },
    'off-campus': { label: 'Off Campus',  cls: 'badge-off-campus' },
    busy:         { label: 'Busy',        cls: 'badge-busy' },
    'on-leave':   { label: 'On Leave',    cls: 'badge-on-leave' },
  }
  const { label, cls } = map[status] ?? map.offline
  return (
    <span className={`badge ${cls}`}>
      <span className={`status-dot status-dot-${status}`} />
      {label}
    </span>
  )
}

// ── AudienceBadge ────────────────────────────────────────────
// Who an announcement was sent to: every student, or one named group
export function AudienceBadge({ announcement }) {
  const isGroup = announcement.audience === 'group'
  return (
    <span className={`inline-flex items-center gap-1 max-w-full text-[11px] font-bold px-2 py-1 rounded-full
      ${isGroup ? 'bg-primary-light text-primary' : 'bg-green-100 text-green-700'}`}>
      <span className="material-symbols-outlined shrink-0" style={{ fontSize: 13 }}>{isGroup ? 'groups' : 'public'}</span>
      <span className="truncate">{isGroup ? (announcement.group?.name ?? 'Group') : 'All students'}</span>
    </span>
  )
}

// ── Avatar ───────────────────────────────────────────────────
export function Avatar({ src, name, size = 'md', className = '' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-11 h-11 text-sm', lg: 'w-16 h-16 text-xl', xl: 'w-24 h-24 text-3xl' }
  const initials = name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?'
  return src ? (
    <img src={src} alt={name} className={`${sizes[size]} rounded-xl object-cover ${className}`} />
  ) : (
    <div className={`${sizes[size]} rounded-xl bg-primary-light flex items-center justify-center font-bold text-primary ${className}`}>
      {initials}
    </div>
  )
}

// ── Spinner ──────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <svg className="animate-spin text-primary" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// ── StatCard ─────────────────────────────────────────────────
export function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className={`card p-3 sm:p-5 flex flex-col gap-1 sm:gap-2 transition-all hover:shadow-md hover:-translate-y-0.5 ${accent ? 'bg-primary border-transparent shadow-primary' : ''}`}>
      <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${accent ? 'text-white/60' : 'text-text-faint'}`}>{label}</div>
      <div className={`text-2xl sm:text-4xl font-extrabold tracking-tight leading-none ${accent ? 'text-white' : 'text-text'}`}>{value}</div>
      {sub && <div className={`text-[11px] sm:text-xs font-medium ${accent ? 'text-white/50' : 'text-text-faint'}`}>{sub}</div>}
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────
// Slides up from the bottom on a phone, scales in on larger screens, and
// animates out the same way when closed.
export function Modal({ open, onClose, title, children, wide }) {
  const { mounted, closing } = usePresence(open)
  // While it animates out, keep showing what it last showed: callers usually
  // clear the state its content is built from in the same moment they close it
  const last = useRef({ title, children })
  if (open) last.current = { title, children }
  if (!mounted) return null
  const shown = open ? { title, children } : last.current

  return (
    <div
      className={`fixed inset-0 bg-text/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4
        ${closing ? 'animate-fade-out pointer-events-none' : 'animate-fade-in'}`}
      onClick={onClose}
    >
      <div
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-xl shadow-lg p-5 sm:p-7 max-h-[92vh] overflow-y-auto
          ${closing ? 'animate-sheet-out sm:animate-dialog-out' : 'animate-sheet-in sm:animate-dialog-in'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base sm:text-lg font-extrabold text-text tracking-tight">{shown.title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-low flex items-center justify-center text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        {shown.children}
      </div>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────
export function EmptyState({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="material-symbols-outlined text-5xl text-text-faint mb-4" style={{ fontSize: 48 }}>{icon}</span>
      <div className="text-base font-bold text-text mb-1">{title}</div>
      <div className="text-sm text-text-faint max-w-xs">{description}</div>
    </div>
  )
}

// ── Page Header ──────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-5 sm:mb-7 gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ── Byte formatter ───────────────────────────────────────────
export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Loading Page ─────────────────────────────────────────────
// Grey shapes of the page about to appear, in place of a spinner. `variant`
// picks the layout; `header` adds the page title placeholders. It fades in
// after a short pause, so a fast load never flashes it.
export function LoadingPage({ variant = 'list', header = true }) {
  return (
    <div role="status" aria-busy="true" style={{ animation: 'fade-in 200ms ease-out 120ms backwards' }}>
      <span className="sr-only">Loading…</span>
      {header && (
        <div className="mb-5 sm:mb-7 space-y-2.5">
          <Bone className="h-7 w-48 sm:w-64" />
          <Bone className="h-4 w-64 sm:w-96 max-w-full" />
        </div>
      )}
      {(SKELETONS[variant] ?? SKELETONS.list)()}
    </div>
  )
}

function Bone({ className = '', style }) {
  // A radius passed in replaces the default; with both, CSS order rather
  // than intent decides which applies
  const radius = /\brounded/.test(className) ? '' : 'rounded-md'
  return <div className={`skeleton ${radius} ${className}`} style={style} />
}

const Lines = ({ widths }) => (
  <div className="space-y-2.5">{widths.map((w, i) => <Bone key={i} className={`h-3.5 ${w}`} />)}</div>
)

// A list card: icon or avatar, two lines, a status pill
const RowBones = () => (
  <div className="card p-4 sm:p-5 flex items-center gap-3">
    <Bone className="w-9 h-9 rounded-lg shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <Bone className="h-3.5 w-2/5" />
      <Bone className="h-3 w-3/5" />
    </div>
    <Bone className="h-6 w-16 rounded-full shrink-0" />
  </div>
)

// A grid card: icon, two lines, a row of chips
const TileBones = () => (
  <div className="card p-4 sm:p-5 space-y-4">
    <div className="flex items-center gap-3">
      <Bone className="w-10 h-10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <Bone className="h-3.5 w-1/2" />
        <Bone className="h-3 w-1/3" />
      </div>
    </div>
    <div className="flex gap-1.5">
      <Bone className="h-5 w-16 rounded-full" />
      <Bone className="h-5 w-20 rounded-full" />
      <Bone className="h-5 w-14 rounded-full" />
    </div>
  </div>
)

const SKELETONS = {
  list: () => (
    <div className="space-y-3">{[0, 1, 2, 3].map(i => <RowBones key={i} />)}</div>
  ),

  grid: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <TileBones key={i} />)}</div>
  ),

  dashboard: () => (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-7">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card p-3 sm:p-5 space-y-3">
            <Bone className="h-2.5 w-16" />
            <Bone className="h-8 w-14" />
            <Bone className="h-2.5 w-20" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-5 overflow-hidden">
        {[180, 52, 84, 92, 76, 68, 60].map((w, i) => (
          <Bone key={i} className="h-10 rounded-full shrink-0" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[0, 1, 2, 3, 4, 5].map(i => <TileBones key={i} />)}
      </div>
    </>
  ),

  // The announcements inbox: list beside a reading pane
  inbox: () => (
    <div className="card overflow-hidden lg:grid lg:grid-cols-[minmax(300px,360px)_1fr] lg:h-[calc(100vh-13rem)] lg:min-h-[480px]">
      <div className="lg:border-r border-border-light">
        <div className="p-3 border-b border-border-light space-y-2.5">
          <Bone className="h-10 rounded-[10px]" />
          <Bone className="h-2.5 w-24" />
        </div>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex gap-3 px-4 py-3.5 border-b border-border-light">
            <Bone className="w-8 h-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-3.5 w-3/4" />
              <Bone className="h-3 w-1/2" />
              <Bone className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden lg:block px-8 py-7 space-y-5">
        <Bone className="h-6 w-28 rounded-full" />
        <Bone className="h-7 w-3/5" />
        <div className="flex items-center gap-3">
          <Bone className="w-8 h-8 rounded-xl shrink-0" />
          <div className="space-y-2">
            <Bone className="h-3.5 w-32" />
            <Bone className="h-3 w-56" />
          </div>
        </div>
        <div className="h-px bg-border-light" />
        <Lines widths={['w-full', 'w-11/12', 'w-4/5', 'w-2/3']} />
      </div>
    </div>
  ),

  // A classroom: its tabs, then chat bubbles from both sides
  chat: () => (
    <>
      <Bone className="h-11 w-72 max-w-full rounded-xl mb-5 sm:mb-6" />
      <div className="card px-4 sm:px-5 py-5 space-y-4 h-[65vh] min-h-[360px] overflow-hidden">
        {[['w-2/5', false], ['w-1/3', true], ['w-1/2', false], ['w-1/4', true], ['w-2/5', false]].map(([w, mine], i) => (
          <div key={i} className={`flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
            {!mine && <Bone className="w-8 h-8 rounded-xl shrink-0" />}
            <Bone className={`h-10 ${w} rounded-2xl`} />
          </div>
        ))}
      </div>
    </>
  ),

  // Settings-style pages: two cards of labelled fields
  form: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
      {[3, 2].map((fields, i) => (
        <div key={i} className="card p-4 sm:p-6 space-y-5">
          <Bone className="h-5 w-40" />
          {Array.from({ length: fields }, (_, j) => (
            <div key={j} className="space-y-2">
              <Bone className="h-3 w-24" />
              <Bone className="h-11 rounded-[10px]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}
