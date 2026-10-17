import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  useClassroom, useNotifications, groupSubmissionChains, checkClassFile, classFileType,
  CLASS_FILE_ACCEPT, CHAT_HISTORY_LIMIT, MAX_CLASS_FILE_BYTES,
} from '@/hooks/useData'
import { Avatar, PageHeader, LoadingPage, EmptyState, Modal, Spinner, formatBytes } from '@/components/ui'
import { format, formatDistanceToNow, isToday, isYesterday, isSameDay } from 'date-fns'
import toast from 'react-hot-toast'

const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`
const displayName = p => (p ? (p.honorific ? `${p.honorific} ${p.full_name}` : p.full_name) : 'Unknown')

// Icon and colour per file type, so a list of files can be scanned at a glance
const FILE_STYLES = [
  { test: t => t === 'application/pdf',                            icon: 'picture_as_pdf', cls: 'bg-red-50 text-red-600' },
  { test: t => t.includes('word'),                                 icon: 'description',    cls: 'bg-blue-50 text-blue-600' },
  { test: t => t.includes('presentation') || t.includes('powerpoint'), icon: 'slideshow',  cls: 'bg-orange-50 text-orange-600' },
  { test: t => t.includes('sheet') || t.includes('excel'),         icon: 'table_chart',    cls: 'bg-green-50 text-green-700' },
  { test: t => t.startsWith('image/'),                             icon: 'image',          cls: 'bg-purple-50 text-purple-600' },
  { test: t => t === 'application/zip',                            icon: 'folder_zip',     cls: 'bg-amber-50 text-amber-700' },
]

export default function ClassroomPage() {
  const { id } = useParams()
  // Keyed by id, so moving from one classroom to another starts clean
  return <Classroom key={id} id={id} />
}

function Classroom({ id }) {
  const { profile, role } = useAuth()
  const isTeacher = role === 'staff'
  const { group, members, messages, files, loading, missing, setupNeeded, sendMessage, submitWork, getFileUrl } = useClassroom(id)
  const { markReadByType } = useNotifications()
  const [tab, setTab] = useState('chat')

  // Opening a classroom is seeing the work submitted to it, so clear that
  // classroom's notifications here — and only that classroom's
  useEffect(() => {
    if (isTeacher) markReadByType(['class_work'], n => n.group_id === id)
  }, [isTeacher, markReadByType, id])

  const chains = useMemo(() => groupSubmissionChains(files), [files])
  const back = isTeacher
    ? { to: '/app/staff/classrooms', label: 'Classrooms' }
    : { to: '/app/student/classes', label: 'My Classes' }

  async function openFile(f) {
    const { url, inline, error } = await getFileUrl(f)
    if (error || !url) return toast.error('Could not open the file')
    // Anything not viewable in a browser is served as an attachment, so
    // following its link downloads it and leaves this page where it is
    if (inline) window.open(url, '_blank', 'noopener')
    else window.location.assign(url)
  }

  if (loading) return <LoadingPage variant="chat" />

  if (setupNeeded) {
    return (
      <div>
        <BackLink {...back} />
        <EmptyState
          icon="database"
          title="Classrooms are not set up yet"
          description={isTeacher
            ? 'Apply supabase/migrations/20261017b_classrooms.sql in the Supabase SQL Editor, then reload this page.'
            : 'Ask an administrator to apply the classrooms migration.'}
        />
      </div>
    )
  }

  if (missing || !group) {
    return (
      <div>
        <BackLink {...back} />
        <EmptyState icon="school" title="Classroom not found" description="It may have been deleted, or you are no longer in it." />
      </div>
    )
  }

  return (
    <div>
      <BackLink {...back} />
      <PageHeader
        title={group.name}
        subtitle={isTeacher ? plural(members.length, 'student') : `Teacher: ${displayName(group.teacher)}`}
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-low rounded-xl mb-5 sm:mb-6 w-fit max-w-full overflow-x-auto">
        {[
          { id: 'chat', label: 'Chat' },
          { id: 'work', label: `${isTeacher ? 'Work' : 'My Work'} (${chains.length})` },
          { id: 'log',  label: `Log (${files.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all duration-150
              ${tab === t.id ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Keyed by tab, so switching tabs fades the new one in */}
      <div key={tab} className="animate-fade-in">
        {tab === 'chat' && (
          <ClassChat messages={messages} me={profile.id} teacherId={group.owner_id} onSend={sendMessage} />
        )}
        {tab === 'work' && (isTeacher
          ? <TeacherWork members={members} chains={chains} onOpen={openFile} />
          : <StudentWork chains={chains} onSubmit={submitWork} onOpen={openFile} />)}
        {tab === 'log' && (
          <WorkLog files={files} chains={chains} me={profile.id} isTeacher={isTeacher} onOpen={openFile} />
        )}
      </div>
    </div>
  )
}

function BackLink({ to, label }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline mb-3">
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
      {label}
    </Link>
  )
}

// ── Chat ─────────────────────────────────────────────────────

function ClassChat({ messages, me, teacherId, onSend }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  // Follow new messages only while the reader is at the bottom, so scrolling
  // back through history is not yanked down by every new message
  const atBottom = useRef(true)
  // Messages already here when the chat opens appear at once; only ones that
  // arrive while it is open animate in
  const initialIds = useRef(null)
  if (initialIds.current === null) initialIds.current = new Set(messages.map(m => m.id))

  useEffect(() => {
    const el = listRef.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  function onScroll() {
    const el = listRef.current
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function fitHeight(el) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const { error } = await onSend(body)
    setSending(false)
    if (error) return toast.error(error.message || 'Message not sent')
    setDraft('')
    atBottom.current = true
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.focus()
    }
  }

  return (
    <div className="card flex flex-col h-[65vh] min-h-[360px] overflow-hidden">
      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
        {messages.length >= CHAT_HISTORY_LIMIT && (
          <p className="text-center text-[11px] text-text-faint">Showing the latest {CHAT_HISTORY_LIMIT} messages</p>
        )}
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <span className="material-symbols-outlined text-text-faint mb-3" style={{ fontSize: 40 }}>forum</span>
            <div className="text-sm font-bold text-text">No messages yet</div>
            <div className="text-xs text-text-faint mt-1 max-w-xs">
              The teacher and every student in this classroom see what is written here.
            </div>
          </div>
        ) : messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || !isSameDay(new Date(m.created_at), new Date(messages[i - 1].created_at))) && (
              <DayDivider date={m.created_at} />
            )}
            <ChatMessage
              message={m}
              mine={m.sender_id === me}
              fromTeacher={m.sender_id === teacherId}
              fresh={!initialIds.current.has(m.id)}
            />
          </Fragment>
        ))}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="border-t border-border-light p-2.5 sm:p-3 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={2000}
          className="form-input h-auto min-h-[44px] max-h-32 py-2.5 resize-none"
          placeholder="Write a message…"
          value={draft}
          onChange={e => { setDraft(e.target.value); fitHeight(e.target) }}
          onKeyDown={e => {
            // Enter sends and Shift+Enter starts a new line — but not while an
            // input method is still composing a character
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          type="submit"
          title="Send"
          className="btn-primary h-11 w-11 px-0 shrink-0"
          disabled={sending || !draft.trim()}
        >
          {sending ? <Spinner size={16} /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>}
        </button>
      </form>
    </div>
  )
}

function DayDivider({ date }) {
  const d = new Date(date)
  const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'd MMM yyyy')
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-border-light" />
      <span className="text-[10px] font-bold text-text-faint uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-border-light" />
    </div>
  )
}

function ChatMessage({ message: m, mine, fromTeacher, fresh }) {
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : ''} ${fresh ? 'animate-rise' : ''}`}>
      {!mine && <Avatar name={m.sender?.full_name} src={m.sender?.avatar_url} size="sm" className="shrink-0" />}
      <div className={`flex flex-col max-w-[80%] sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && (
          <div className="flex items-center gap-1.5 mb-0.5 px-1 max-w-full">
            <span className="text-[11px] font-bold text-text-muted truncate">{displayName(m.sender)}</span>
            {fromTeacher && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 uppercase tracking-wide shrink-0">
                Teacher
              </span>
            )}
          </div>
        )}
        <div className={`max-w-full px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
          ${mine ? 'bg-primary text-white rounded-br-md'
            : fromTeacher ? 'bg-green-50 text-text border border-green-100 rounded-bl-md'
            : 'bg-surface-low text-text rounded-bl-md'}`}>
          {m.body}
        </div>
        <span className="text-[10px] text-text-faint mt-0.5 px-1">{format(new Date(m.created_at), 'h:mm a')}</span>
      </div>
    </div>
  )
}

// ── Work ─────────────────────────────────────────────────────

function FileIcon({ type, small = false }) {
  const style = FILE_STYLES.find(s => type && s.test(type)) ?? { icon: 'draft', cls: 'bg-surface-low text-text-muted' }
  return (
    <span className={`${small ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg flex items-center justify-center shrink-0 ${style.cls}`}>
      <span className="material-symbols-outlined" style={{ fontSize: small ? 16 : 20 }}>{style.icon}</span>
    </span>
  )
}

// One piece of work: its latest version, with the earlier ones behind a toggle
function WorkItem({ versions, onOpen, onUpdate }) {
  const [showHistory, setShowHistory] = useState(false)
  const latest = versions[0]

  return (
    <div className="rounded-[10px] border border-border-light bg-white p-3">
      <div className="flex items-start gap-3">
        <FileIcon type={latest.mime_type} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-text truncate" title={latest.file_name}>{latest.file_name}</div>
          <div className="text-[11px] text-text-faint">
            v{latest.version} · {formatBytes(latest.file_size)} · {latest.version === 1 ? 'submitted' : 'updated'}{' '}
            {formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => onOpen(latest)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary-light hover:brightness-95 transition-all"
          >
            Open
          </button>
          {onUpdate && (
            <button
              onClick={() => onUpdate(versions)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-text-muted bg-surface-low hover:bg-border-light transition-colors"
            >
              Update
            </button>
          )}
        </div>
      </div>

      {versions.length > 1 && (
        <>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{showHistory ? 'expand_less' : 'history'}</span>
            {showHistory ? 'Hide earlier versions' : plural(versions.length - 1, 'earlier version')}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5 pl-1 animate-fade-in">
              {versions.slice(1).map(v => (
                <div key={v.id} className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-text shrink-0">v{v.version}</span>
                  <span className="text-text-muted truncate">{v.file_name}</span>
                  <span className="text-text-faint shrink-0">{format(new Date(v.created_at), 'd MMM, h:mm a')}</span>
                  <button onClick={() => onOpen(v)} className="text-primary font-semibold hover:underline shrink-0">open</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StudentWork({ chains, onSubmit, onOpen }) {
  const inputRef = useRef(null)
  const [updating, setUpdating] = useState(null)   // versions of the file being updated; null for new work
  const [pending, setPending] = useState(null)     // { file, versions } waiting to be confirmed
  const [uploading, setUploading] = useState(false)

  function choose(versions) {
    setUpdating(versions)
    inputRef.current.value = ''
    inputRef.current.click()
  }

  function picked(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const problem = checkClassFile(file)
    if (problem) return toast.error(problem)
    setPending({ file, versions: updating })
  }

  // Confirmed rather than uploaded on pick: a submission can never be deleted,
  // so choosing the wrong file by mistake would stay in the log for good
  async function confirm() {
    setUploading(true)
    const { data, error } = await onSubmit(pending.file, pending.versions?.[0] ?? null)
    setUploading(false)
    if (error) return toast.error(error.message || 'Upload failed')
    toast.success(pending.versions ? `Updated to version ${data.version}` : 'Work submitted')
    setPending(null)
  }

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept={CLASS_FILE_ACCEPT} className="hidden" onChange={picked} />

      <section className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>upload_file</span>
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm text-text">Submit work</h2>
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              PDF, Word, PowerPoint, Excel, images or ZIP, up to {MAX_CLASS_FILE_BYTES / 1024 / 1024} MB.
              Only you and your teacher can see your files.
            </p>
          </div>
        </div>
        <button className="btn-primary shrink-0" onClick={() => choose(null)}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
          Choose File
        </button>
      </section>

      {chains.length === 0 ? (
        <EmptyState icon="upload_file" title="Nothing submitted yet" description="Files you submit appear here, where you can update them with a new version." />
      ) : chains.map(versions => (
        <WorkItem key={versions[0].parent_id ?? versions[0].id} versions={versions} onOpen={onOpen} onUpdate={choose} />
      ))}

      <Modal
        open={!!pending}
        onClose={() => { if (!uploading) setPending(null) }}
        title={pending?.versions ? 'Update File' : 'Submit Work'}
      >
        {pending && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-[10px] bg-surface-low">
              <FileIcon type={classFileType(pending.file.name)} />
              <div className="min-w-0">
                <div className="text-sm font-bold text-text truncate">{pending.file.name}</div>
                <div className="text-[11px] text-text-faint">{formatBytes(pending.file.size)}</div>
              </div>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              {pending.versions
                ? `This becomes version ${pending.versions[0].version + 1} of ${pending.versions[0].file_name}. Earlier versions are kept, and your teacher sees the update in the log.`
                : 'Once submitted, a file cannot be deleted. You can update it later with a new version, and your teacher sees each one in the log.'}
            </p>
            <div className="flex gap-2.5">
              <button className="btn-secondary flex-1" onClick={() => setPending(null)} disabled={uploading}>Cancel</button>
              <button className="btn-primary flex-1" onClick={confirm} disabled={uploading}>
                {uploading ? <Spinner size={16} /> : pending.versions ? 'Upload New Version' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function TeacherWork({ members, chains, onOpen }) {
  // Everyone in the classroom, then anyone who submitted before being removed
  // from it — their work is still on record
  const rows = useMemo(() => {
    const byStudent = new Map()
    for (const versions of chains) {
      const sid = versions[0].student_id
      if (!byStudent.has(sid)) byStudent.set(sid, [])
      byStudent.get(sid).push(versions)
    }
    const inClass = new Set(members.map(m => m.id))
    const list = members.map(m => ({ id: m.id, student: m, chains: byStudent.get(m.id) ?? [], removed: false }))
    for (const [sid, cs] of byStudent) {
      if (!inClass.has(sid)) list.push({ id: sid, student: cs[0][0].student, chains: cs, removed: true })
    }
    return list
  }, [members, chains])

  const submitted = rows.filter(r => !r.removed && r.chains.length > 0).length

  if (rows.length === 0) {
    return <EmptyState icon="group" title="No students in this classroom" description="Add students to it from the Classrooms page." />
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        {submitted} of {plural(members.length, 'student')} {submitted === 1 ? 'has' : 'have'} submitted work.
      </p>
      {rows.map(r => (
        <div key={r.id} className="card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Avatar name={r.student?.full_name} src={r.student?.avatar_url} size="sm" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-text truncate">{r.student?.full_name ?? 'Former student'}</div>
              <div className="text-xs text-text-faint truncate">
                {r.student?.student_id ? `ID: ${r.student.student_id}` : '—'}
                {r.removed && ' · no longer in this classroom'}
              </div>
            </div>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0
              ${r.chains.length ? 'bg-green-100 text-green-700' : 'bg-surface-low text-text-faint'}`}>
              {r.chains.length ? plural(r.chains.length, 'file') : 'Nothing yet'}
            </span>
          </div>
          {r.chains.length > 0 && (
            <div className="mt-3 space-y-2">
              {r.chains.map(versions => (
                <WorkItem key={versions[0].parent_id ?? versions[0].id} versions={versions} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Log ──────────────────────────────────────────────────────
// Every upload is its own row and none can be changed or removed, so the
// file records themselves are the log: version 1 is a submission, any later
// version an update.
function WorkLog({ files, chains, me, isTeacher, onOpen }) {
  // The file each update replaced, for when the name changed
  const replaced = useMemo(() => {
    const map = new Map()
    for (const versions of chains) {
      for (let i = 0; i < versions.length - 1; i++) map.set(versions[i].id, versions[i + 1].file_name)
    }
    return map
  }, [chains])

  if (files.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="Nothing logged yet"
        description={isTeacher
          ? 'Each time a student submits or updates a file, it is logged here.'
          : 'Each time you submit or update a file, it is logged here.'}
      />
    )
  }

  return (
    <div className="card divide-y divide-border-light">
      {files.map(f => {
        const updated = f.version > 1
        const was = replaced.get(f.id)
        return (
          <div key={f.id} className="flex items-start gap-3 p-3.5 sm:p-4">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
              ${updated ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{updated ? 'sync' : 'upload_file'}</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-text break-words">
                <span className="font-bold">{f.student_id === me ? 'You' : (f.student?.full_name ?? 'A student')}</span>
                {' '}{updated ? 'updated' : 'submitted'}{' '}
                <span className="font-semibold">{f.file_name}</span>
              </div>
              <div className="text-[11px] text-text-faint mt-0.5">
                v{f.version}
                {updated && was && was !== f.file_name && ` · replaced ${was}`}
                {' · '}{format(new Date(f.created_at), 'd MMM yyyy, h:mm a')}
              </div>
            </div>
            <button onClick={() => onOpen(f)} className="text-xs font-semibold text-primary hover:underline shrink-0">
              Open
            </button>
          </div>
        )
      })}
    </div>
  )
}
