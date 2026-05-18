import { useState } from 'react'
import { useStaffList, useDashboardStats } from '@/hooks/useData'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge, Avatar, StatCard, EmptyState, PageHeader, LoadingPage } from '@/components/ui'
import { formatDistanceToNow } from 'date-fns'

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'available',  label: 'Available' },
  { id: 'meeting',    label: 'In Meeting' },
  { id: 'in-class',   label: 'In Class' },
  { id: 'in-lab',     label: 'In Lab' },
  { id: 'on-break',   label: 'On Break' },
  { id: 'busy',       label: 'Busy' },
  { id: 'away',       label: 'Away' },
  { id: 'off-campus', label: 'Off Campus' },
  { id: 'on-leave',   label: 'On Leave' },
  { id: 'offline',    label: 'Offline' },
]

const ABSENT_STATUSES = ['offline', 'off-campus', 'on-leave']

export default function DashboardPage() {
  const { role } = useAuth()
  const { staff, loading } = useStaffList()
  const { stats } = useDashboardStats(staff)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = staff.filter(s => {
    const matchF = filter === 'all' || s.status === filter
    const matchS = !search || s.full_name.toLowerCase().includes(search.toLowerCase()) || s.department?.toLowerCase().includes(search.toLowerCase())
    return matchF && matchS
  })

  if (loading) return <LoadingPage />

  return (
    <div>
      <PageHeader
        title="Faculty Availability"
        subtitle="Real-time presence tracking across campus"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-7">
        <StatCard label="On Campus" value={`${stats.onCampusPct}%`} sub={`${stats.onCampus} of ${stats.total} present`} accent />
        <StatCard label="Available" value={stats.available} sub="Ready to meet" />
        <StatCard label="In Meeting" value={stats.meeting} sub="Occupied now" />
        <StatCard label="Away / Offline" value={stats.away + stats.offline} sub="Unavailable" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 sm:max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>search</span>
          <input
            type="text"
            className="form-input pl-9"
            placeholder="Search faculty..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-2 rounded-full text-xs font-bold border transition-all duration-150
                ${filter === f.id ? 'bg-primary text-white border-primary' : 'bg-white text-text-muted border-border hover:border-primary hover:text-primary'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState icon="search_off" title="No faculty found" description="Try adjusting your search or filter." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <StaffCard key={s.id} staff={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function StaffCard({ staff: s }) {
  const timeAgo = s.updated_at
    ? formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })
    : null

  return (
    <div className="card p-4 sm:p-5 cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 group">
      <div className="flex items-start gap-3.5 mb-3.5">
        <div className="relative shrink-0">
          <Avatar name={s.full_name} src={s.avatar_url} size="md" />
          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white status-dot status-dot-${s.status}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-text truncate">
            {s.honorific ? `${s.honorific} ${s.full_name}` : s.full_name}
          </div>
          <div className="text-xs text-text-faint truncate">{s.department ?? '—'}</div>
          <div className="mt-1.5">
            <StatusBadge status={s.status} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-text-muted font-medium">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span>
          {s.location || '—'}
        </span>
        <span className="text-text-faint font-mono">{timeAgo ?? '—'}</span>
      </div>
      {s.note && (
        <div className="mt-2.5 text-xs text-text-faint bg-surface-low rounded-lg px-2.5 py-1.5 italic">
          "{s.note}"
        </div>
      )}
    </div>
  )
}
