import { useState, useEffect, useMemo, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useMyStatus, useActivityLog } from '@/hooks/useData'
import { StatusBadge, Avatar, PageHeader, LoadingPage, Spinner } from '@/components/ui'
import { QRCodeSVG } from 'qrcode.react'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

const HONORIFICS = ['Prof.', 'Assoc. Prof.', 'Asst. Prof.', 'Dr.', 'Lecturer', 'Director', 'Chairman', 'Mr.', 'Ms.', 'Mrs.']

const ACTION_ICONS = {
  qr_checkin:    { icon: 'qr_code_scanner', color: 'text-green-600 bg-green-50' },
  status_update: { icon: 'edit',            color: 'text-blue-600 bg-blue-50' },
  default:       { icon: 'info',            color: 'text-text-faint bg-surface-low' },
}

export default function StaffProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const { status, loading } = useMyStatus()
  const { logs } = useActivityLog(profile?.id)

  // Honorific and name are edited together — they are one idea ("how I am
  // addressed"), and previously lived in two separate cards in two columns.
  const [details, setDetails] = useState({ full_name: '', honorific: '' })
  const [savingDetails, setSavingDetails] = useState(false)
  const [pwForm, setPwForm] = useState({ newPassword: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (profile) {
      setDetails({ full_name: profile.full_name ?? '', honorific: profile.honorific ?? '' })
    }
  }, [profile?.full_name, profile?.honorific])

  // Memoised: this used to be built in the render body with ts: Date.now(), so
  // the QR silently regenerated on every keystroke and was never a stable code.
  const qrPayload = useMemo(
    () => JSON.stringify({ staffId: profile?.id, name: profile?.full_name, ts: Date.now() }),
    [profile?.id, profile?.full_name]
  )

  const detailsDirty =
    details.full_name !== (profile?.full_name ?? '') ||
    details.honorific !== (profile?.honorific ?? '')

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB')
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file')

    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${profile.id}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadErr) {
        const msg = uploadErr.message?.toLowerCase() ?? ''
        if (msg.includes('bucket') || msg.includes('not found')) {
          return toast.error('Storage bucket "avatars" not found. Create it in Supabase Dashboard → Storage → New bucket (set Public = on).')
        }
        return toast.error('Upload failed: ' + uploadErr.message)
      }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const urlWithBust = `${publicUrl}?t=${Date.now()}`

      await supabase.from('profiles').update({ avatar_url: urlWithBust }).eq('id', profile.id)
      await refreshProfile()
      toast.success('Profile photo updated')
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  // One write instead of the two separate saves this page used to have
  async function handleDetailsSave(e) {
    e.preventDefault()
    if (!details.full_name.trim()) return toast.error('Name cannot be empty')

    setSavingDetails(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: details.full_name.trim(), honorific: details.honorific || null })
      .eq('id', profile.id)
    setSavingDetails(false)

    if (error) return toast.error('Failed to save: ' + error.message)
    await refreshProfile()
    toast.success('Details updated')
  }

  async function handlePasswordSave(e) {
    e.preventDefault()
    if (pwForm.newPassword.length < 6) return toast.error('Password must be at least 6 characters')
    if (pwForm.newPassword !== pwForm.confirm) return toast.error('Passwords do not match')
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword })
    setSavingPw(false)
    if (error) return toast.error(error.message)
    setPwForm({ newPassword: '', confirm: '' })
    toast.success('Password updated')
  }

  if (loading) return <LoadingPage />

  const displayName = profile?.honorific
    ? `${profile.honorific} ${profile.full_name}`
    : profile?.full_name

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your identity, check-in code and account settings" />

      {/* ── Identity ── */}
      <div className="card p-4 sm:p-6 mb-4 sm:mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative group shrink-0 self-start focus:outline-none rounded-xl"
            title="Change profile photo"
          >
            <Avatar name={profile?.full_name} src={profile?.avatar_url} size="lg" />
            <span className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar
                ? <Spinner size={20} />
                : <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>photo_camera</span>}
            </span>
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-border-light shadow-sm flex items-center justify-center">
              <span className="material-symbols-outlined text-text-muted" style={{ fontSize: 13 }}>edit</span>
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarUpload}
          />

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-text tracking-tight truncate">{displayName}</h2>
            <p className="text-sm text-text-muted mt-0.5">{profile?.department ?? 'No department'}</p>
            <p className="text-xs text-text-faint mt-0.5 break-all">{profile?.email}</p>
          </div>

          {/* Current status, with the one action that changes it */}
          <NavLink
            to="/app/staff/status"
            className="flex sm:flex-col sm:items-end items-center justify-between gap-2 shrink-0 sm:text-right group"
          >
            <div>
              <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest mb-1.5">Current status</div>
              <StatusBadge status={status?.status ?? 'offline'} />
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-primary group-hover:underline whitespace-nowrap">
              Update
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>chevron_right</span>
            </span>
          </NavLink>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-5">
          {/* Editable details — the single place this data is changed */}
          <section className="card p-4 sm:p-6">
            <SectionHeading icon="badge" title="Personal Details" />
            <form onSubmit={handleDetailsSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="form-label">Honorific</label>
                  <div className="relative">
                    <select
                      className="form-select pr-8"
                      value={details.honorific}
                      onChange={e => setDetails(d => ({ ...d, honorific: e.target.value }))}
                    >
                      <option value="">— None —</option>
                      {HONORIFICS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-input"
                    value={details.full_name}
                    onChange={e => setDetails(d => ({ ...d, full_name: e.target.value }))}
                    placeholder="Your full name"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button type="submit" className="btn-primary px-6" disabled={savingDetails || !detailsDirty}>
                  {savingDetails
                    ? <Spinner size={16} />
                    : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>}
                  Save Changes
                </button>
                {detailsDirty && <span className="text-xs text-text-faint">Unsaved changes</span>}
              </div>
            </form>

            {/* Read-only facts, listed once, with who to ask to change them */}
            <div className="mt-6 pt-5 border-t border-border-light">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
                <ReadOnlyField label="Department" value={profile?.department ?? '—'} />
                <ReadOnlyField label="Role" value={profile?.role === 'staff' ? 'Faculty' : profile?.role} />
                <ReadOnlyField label="Faculty ID" value={profile?.id?.slice(0, 8).toUpperCase()} mono />
                <ReadOnlyField
                  label="Status updated"
                  value={status?.updated_at
                    ? formatDistanceToNow(new Date(status.updated_at), { addSuffix: true })
                    : 'Never'}
                />
              </dl>
              <p className="text-[11px] text-text-faint mt-4">
                Department, role and email are managed by your administrator.
              </p>
            </div>
          </section>

          {/* Activity */}
          <section className="card p-4 sm:p-6">
            <SectionHeading icon="history" title="Recent Activity" />
            {logs.length === 0 ? (
              <p className="text-sm text-text-faint text-center py-10">No activity yet.</p>
            ) : (
              <div className="divide-y divide-border-light -my-1">
                {logs.map(log => {
                  const { icon, color } = ACTION_ICONS[log.action] ?? ACTION_ICONS.default
                  return (
                    <div key={log.id} className="flex items-center gap-3.5 py-3">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-text truncate">{log.detail}</div>
                        <div className="text-xs text-text-faint mt-0.5">
                          {format(new Date(log.created_at), 'd MMM, h:mm a')}
                        </div>
                      </div>
                      <span className="text-xs text-text-faint shrink-0 hidden sm:block">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4 sm:space-y-5">
          {/* QR is a primary faculty feature — no longer hidden behind a toggle */}
          <section className="card p-4 sm:p-5">
            <SectionHeading icon="qr_code_2" title="Check-In QR" />
            <div className="flex flex-col items-center">
              <div className="p-3 bg-white border border-border-light rounded-lg">
                <QRCodeSVG value={qrPayload} size={148} level="H" includeMargin />
              </div>
              <p className="text-xs text-text-faint leading-relaxed text-center mt-3.5">
                Show this at any campus QR terminal to check in.
              </p>
              <div className="w-full mt-3 text-[11px] font-mono text-text-faint bg-surface-low rounded-lg px-3 py-2 text-center break-all">
                {profile?.id?.slice(0, 18)}…
              </div>
            </div>
          </section>

          {/* Security */}
          <section className="card p-4 sm:p-5">
            <SectionHeading icon="lock" title="Password" />
            <form onSubmit={handlePasswordSave} className="space-y-3">
              <div>
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Min 6 characters"
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Repeat new password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                />
              </div>
              <button
                type="submit"
                className="btn-secondary w-full"
                disabled={savingPw || !pwForm.newPassword}
              >
                {savingPw ? <Spinner size={14} /> : 'Change Password'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}

function SectionHeading({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="material-symbols-outlined text-primary" style={{ fontSize: 19 }}>{icon}</span>
      <h2 className="font-bold text-base text-text">{title}</h2>
    </div>
  )
}

function ReadOnlyField({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold text-text-faint uppercase tracking-widest">{label}</dt>
      <dd className={`text-sm font-semibold text-text mt-1 truncate ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
