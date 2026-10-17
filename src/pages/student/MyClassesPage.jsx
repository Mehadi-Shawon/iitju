import { Link } from 'react-router-dom'
import { useMyClasses } from '@/hooks/useData'
import { PageHeader, LoadingPage, EmptyState } from '@/components/ui'

export default function MyClassesPage() {
  const { classes, loading, setupNeeded } = useMyClasses()

  if (loading) return <LoadingPage variant="grid" />

  return (
    <div>
      <PageHeader title="My Classes" subtitle="Chat with your classes and submit your work" />

      {setupNeeded ? (
        <EmptyState
          icon="school"
          title="Classes are not available yet"
          description="Ask an administrator to apply the classrooms migration."
        />
      ) : classes.length === 0 ? (
        <EmptyState
          icon="school"
          title="You are not in any class yet"
          description="When a faculty member adds you to one of their classrooms, it appears here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {classes.map(c => {
            const t = c.teacher
            const teacherName = t ? (t.honorific ? `${t.honorific} ${t.full_name}` : t.full_name) : 'Faculty'
            return (
              <Link
                key={c.id}
                to={`/app/student/classes/${c.id}`}
                className="card p-4 sm:p-5 flex items-center gap-3 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30"
              >
                <div className="w-11 h-11 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>school</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-text truncate">{c.name}</div>
                  <div className="text-xs text-text-faint truncate mt-0.5">{teacherName}</div>
                </div>
                <span className="material-symbols-outlined text-text-faint shrink-0" style={{ fontSize: 18 }}>chevron_right</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
