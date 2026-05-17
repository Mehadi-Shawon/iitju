import { useActivityLog } from '@/hooks/useData'
import { PageHeader, LoadingPage, EmptyState } from '@/components/ui'
import { formatDistanceToNow, format } from 'date-fns'

const ACTION_META = {
  qr_checkin:    { icon: 'qr_code_scanner', color: 'text-green-600 bg-green-50',     label: 'QR Check-In' },
  status_update: { icon: 'edit',            color: 'text-blue-600 bg-blue-50',       label: 'Status Update' },
  default:       { icon: 'info',            color: 'text-text-faint bg-surface-low', label: 'Event' },
}

export default function AdminActivityPage() {
  const { logs, loading, refetch } = useActivityLog('all', 100)

  if (loading) return <LoadingPage />

  return (
    <div>
      <PageHeader
        title="Activity Log"
        subtitle="All faculty check-ins and status updates, in real time"
        action={
          <button onClick={refetch} className="btn-secondary text-xs flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            Refresh
          </button>
        }
      />

      {logs.length === 0 ? (
        <EmptyState icon="history" title="No activity yet" description="Activity will appear here as faculty check in and update their status." />
      ) : (
        <>
          {/* ── Mobile cards (< md) ── */}
          <div className="md:hidden space-y-2">
            {logs.map(log => {
              const { icon, color, label } = ACTION_META[log.action] ?? ACTION_META.default
              return (
                <div key={log.id} className="card p-4 flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-text">{label}</span>
                        {log.profiles?.full_name && (
                          <span className="text-xs text-text-muted ml-1.5">· {log.profiles.full_name}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-text-faint font-mono shrink-0">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {log.detail && (
                      <p className="text-xs text-text-muted mt-1 truncate">{log.detail}</p>
                    )}
                    <p className="text-[10px] text-text-faint mt-0.5">
                      {format(new Date(log.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Desktop table (md+) ── */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-light">
                    {['Event', 'Staff Member', 'Detail', 'Time'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const { icon, color, label } = ACTION_META[log.action] ?? ACTION_META.default
                    return (
                      <tr key={log.id} className="border-b border-border-light last:border-0 hover:bg-surface transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
                            </div>
                            <span className="text-xs font-semibold text-text">{label}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="text-sm font-semibold text-text">{log.profiles?.full_name ?? '—'}</div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-text-muted max-w-xs truncate">{log.detail}</td>
                        <td className="px-5 py-3.5">
                          <div className="text-xs font-mono text-text-faint">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </div>
                          <div className="text-[10px] text-text-faint mt-0.5">
                            {format(new Date(log.created_at), 'MMM d, h:mm a')}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
