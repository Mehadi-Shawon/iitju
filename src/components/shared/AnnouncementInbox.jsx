import { useState, useMemo, useEffect } from 'react'
import { Avatar, AudienceBadge } from '@/components/ui'
import { format, formatDistanceToNow, isToday, isYesterday, isThisYear } from 'date-fns'

// The announcements page for both roles: a searchable list of posts beside a
// reading pane, like an email client. On a phone only one pane shows at a
// time — the list, or the post being read.

const displayName = p => (p ? (p.honorific ? `${p.honorific} ${p.full_name}` : p.full_name) : 'Faculty')
const audienceLabel = a => (a.audience === 'group' ? (a.group?.name ?? 'Classroom') : 'All students')
const isEdited = a => new Date(a.updated_at) > new Date(a.created_at)
const excerpt = body => body.replace(/\s+/g, ' ').trim()

// Today's posts show the time, older ones the date
function shortWhen(iso) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy')
}

export default function AnnouncementInbox({
  announcements,      // newest first, with author and group joined
  showAuthor = false, // students see who posted; a teacher's list is all their own
  actions,            // optional (announcement) => buttons for the reading pane
  openId,             // set to a post's id to open it, e.g. one just posted
  emptyState,         // shown in place of the inbox when there are no posts at all
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [reading, setReading] = useState(false)

  useEffect(() => {
    if (!openId) return
    setQuery('')
    setSelectedId(openId)
    setReading(true)
  }, [openId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return announcements
    return announcements.filter(a =>
      [a.title, a.body, audienceLabel(a), showAuthor ? displayName(a.author) : '']
        .some(text => text.toLowerCase().includes(q)))
  }, [announcements, query, showAuthor])

  // Falls back to the newest shown, so deleting or searching away the open
  // post never leaves the reading pane blank
  const selected = shown.find(a => a.id === selectedId) ?? shown[0] ?? null

  if (announcements.length === 0) return <div className="card">{emptyState}</div>

  return (
    <div className="card overflow-hidden lg:grid lg:grid-cols-[minmax(300px,360px)_1fr] lg:h-[calc(100vh-13rem)] lg:min-h-[480px]">
      {/* ── List ── */}
      <section className={`${reading ? 'hidden' : 'flex'} lg:flex flex-col min-h-0 lg:border-r border-border-light`}>
        <div className="p-3 border-b border-border-light">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>search</span>
            <input
              type="text"
              className="form-input h-10 pl-9 pr-9"
              placeholder="Search announcements…"
              aria-label="Search announcements"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-text-faint hover:bg-surface-low hover:text-text transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            )}
          </div>
          <div className="text-[11px] font-semibold text-text-faint mt-2 px-1">
            {query.trim()
              ? `${shown.length} of ${announcements.length} match`
              : `${announcements.length} ${announcements.length === 1 ? 'announcement' : 'announcements'}`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <span className="material-symbols-outlined text-text-faint" style={{ fontSize: 32 }}>search_off</span>
              <p className="text-sm font-bold text-text mt-2">No match</p>
              <p className="text-xs text-text-faint mt-1 break-words">Nothing matches "{query.trim()}".</p>
            </div>
          ) : shown.map(a => (
            <ListRow
              key={a.id}
              announcement={a}
              selected={selected?.id === a.id}
              showAuthor={showAuthor}
              onOpen={() => { setSelectedId(a.id); setReading(true) }}
            />
          ))}
        </div>
      </section>

      {/* ── Reading pane ── */}
      <section className={`${reading ? 'flex' : 'hidden'} lg:flex flex-col min-h-0`}>
        {selected ? (
          // Keyed by post, so opening another one fades it in
          <Reader key={selected.id} announcement={selected} actions={actions} onBack={() => setReading(false)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
            <span className="material-symbols-outlined text-text-faint" style={{ fontSize: 40 }}>drafts</span>
            <p className="text-sm font-bold text-text mt-3">Nothing to show</p>
            <p className="text-xs text-text-faint mt-1">Clear the search to see every announcement.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function ListRow({ announcement: a, selected, showAuthor, onOpen }) {
  const isGroup = a.audience === 'group'
  return (
    <button
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={`relative w-full text-left flex gap-3 px-4 py-3.5 border-b border-border-light transition-colors
        ${selected ? 'bg-primary-light/50' : 'hover:bg-surface-low'}`}
    >
      {selected && <span className="absolute left-0 inset-y-0 w-[3px] bg-primary" />}
      {showAuthor ? (
        <Avatar name={a.author?.full_name} src={a.author?.avatar_url} size="sm" className="shrink-0 mt-0.5" />
      ) : (
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5
          ${isGroup ? 'bg-primary-light text-primary' : 'bg-green-100 text-green-700'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{isGroup ? 'groups' : 'public'}</span>
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`flex-1 min-w-0 text-sm font-bold truncate ${selected ? 'text-primary' : 'text-text'}`}>{a.title}</span>
          <span className="text-[11px] text-text-faint whitespace-nowrap shrink-0">{shortWhen(a.created_at)}</span>
        </span>
        <span className="block text-xs text-text-muted truncate mt-0.5">
          {showAuthor ? `${displayName(a.author)} · ${audienceLabel(a)}` : audienceLabel(a)}
        </span>
        <span className="block text-xs text-text-faint truncate mt-0.5">{excerpt(a.body)}</span>
      </span>
    </button>
  )
}

function Reader({ announcement: a, actions, onBack }) {
  return (
    <article className="flex-1 overflow-y-auto animate-fade-in">
      <div className="px-5 sm:px-8 py-5 sm:py-7 max-w-3xl">
        <button onClick={onBack} className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-primary mb-4">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
          All announcements
        </button>

        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0"><AudienceBadge announcement={a} /></div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions(a)}</div>}
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight leading-snug break-words">{a.title}</h2>

        <div className="flex items-center gap-3 mt-4">
          <Avatar name={a.author?.full_name} src={a.author?.avatar_url} size="sm" className="shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-text truncate">{displayName(a.author)}</div>
            <div className="text-xs text-text-faint">
              {format(new Date(a.created_at), "EEEE, d MMMM yyyy 'at' h:mm a")}
              {isEdited(a) && (
                <span className="whitespace-nowrap"> · edited {formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}</span>
              )}
            </div>
          </div>
        </div>

        <div className="h-px bg-border-light my-5 sm:my-6" />

        <div className="text-[15px] leading-7 text-text whitespace-pre-wrap break-words">{a.body}</div>
      </div>
    </article>
  )
}
