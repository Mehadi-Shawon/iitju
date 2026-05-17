// ── StatusBadge ──────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    available: { label: 'Available', cls: 'badge-available' },
    meeting:   { label: 'In Meeting', cls: 'badge-meeting' },
    away:      { label: 'Away', cls: 'badge-away' },
    offline:   { label: 'Offline', cls: 'badge-offline' },
  }
  const { label, cls } = map[status] ?? map.offline
  return (
    <span className={`badge ${cls}`}>
      <span className={`status-dot status-dot-${status}`} />
      {label}
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
export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-text/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-xl shadow-lg p-5 sm:p-7 max-h-[92vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
        style={{ animation: 'modalIn 0.18s ease' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base sm:text-lg font-extrabold text-text tracking-tight">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-low flex items-center justify-center text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        {children}
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

// ── Loading Page ─────────────────────────────────────────────
export function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  )
}
