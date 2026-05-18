import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useMyStatus, useActivityLog } from '@/hooks/useData'
import { StatusBadge, Avatar, PageHeader, LoadingPage, Spinner } from '@/components/ui'
import { QRCodeSVG } from 'qrcode.react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

const HONORIFICS = ['Prof.', 'Assoc. Prof.', 'Asst. Prof.', 'Dr.', 'Lecturer', 'Director', 'Chairman', 'Mr.', 'Ms.', 'Mrs.']

const STATUS_OPTIONS = [
  { value: 'available',   label: 'Available' },
  { value: 'meeting',     label: 'In Meeting' },
  { value: 'in-class',    label: 'In Class' },
  { value: 'in-lab',      label: 'In Lab' },
  { value: 'on-break',    label: 'On Break' },
  { value: 'busy',        label: 'Busy' },
  { value: 'away',        label: 'Away' },
  { value: 'off-campus',  label: 'Off Campus' },
  { value: 'on-leave',    label: 'On Leave' },
  { value: 'offline',     label: 'Offline' },
]

const ACTION_ICONS = {
  qr_checkin:    { icon: 'qr_code_scanner', color: 'text-green-600 bg-green-50' },
  status_update: { icon: 'edit',            color: 'text-blue-600 bg-blue-50' },
  default:       { icon: 'info',            color: 'text-text-faint bg-surface-low' },
}

export default function StaffProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const { status, loading, updateStatus } = useMyStatus()
  const { logs } = useActivityLog(profile?.id)

  const [form, setForm] = useState({ status: 'available', location: '', note: '' })
  const [honorific, setHonorific] = useState('')
  const [savingHonorific, setSavingHonorific] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const fileInputRef = useRef(null)

  const [nameForm, setNameForm] = useState({ full_name: '' })
  const [savingName, setSavingName] = useState(false)
  const [pwForm, setPwForm] = useState({ newPassword: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    if (profile) setNameForm({ full_name: profile.full_name ?? '' })
  }, [profile?.full_name])

  useEffect(() => {
    if (status) setForm({ status: status.status, location: status.location ?? '', note: status.note ?? '' })
  }, [status])

  useEffect(() => {
    if (profile) setHonorific(profile.honorific ?? '')
  }, [profile])

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

      // Bust cache so the browser fetches the new image
      const urlWithBust = `${publicUrl}?t=${Date.now()}`

      await supabase.from('profiles').update({ avatar_url: urlWithBust }).eq('id', profile.id)
      await refreshProfile()
      toast.success('Profile photo updated!')
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  async function handleNameSave(e) {
    e.preventDefault()
    if (!nameForm.full_name.trim()) return toast.error('Name cannot be empty.')
    setSavingName(true)
    const { error } = await supabase.from('profiles').update({ full_name: nameForm.full_name.trim() }).eq('id', profile.id)
    setSavingName(false)
    if (error) return toast.error('Failed to update name.')
    await refreshProfile()
    toast.success('Name updated!')
  }

  async function handlePasswordSave(e) {
    e.preventDefault()
    if (pwForm.newPassword.length < 6) return toast.error('Password must be at least 6 characters.')
    if (pwForm.newPassword !== pwForm.confirm) return toast.error('Passwords do not match.')
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword })
    setSavingPw(false)
    if (error) return toast.error(error.message)
    setPwForm({ newPassword: '', confirm: '' })
    toast.success('Password updated!')
  }

  async function handleHonorificSave() {
    setSavingHonorific(true)
    const { error } = await supabase.from('profiles').update({ honorific: honorific || null }).eq('id', profile.id)
    setSavingHonorific(false)
    if (error) return toast.error('Failed to save title.')
    await refreshProfile()
    toast.success('Title updated!')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await updateStatus(form)
    setSaving(false)
    if (error) return toast.error('Failed to update: ' + error.message)
    toast.success('Status updated!')
  }

  if (loading) return <LoadingPage />

  const qrPayload = JSON.stringify({ staffId: profile?.id, name: profile?.full_name, ts: Date.now() })

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Manage your availability and check-in status" />

      {/* Hero */}
      <div className="card p-4 sm:p-6 mb-4 sm:mb-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-purple-500" />
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* Clickable avatar with camera overlay */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative group shrink-0 focus:outline-none"
            title="Change profile photo"
          >
            <Avatar name={profile?.full_name} src={profile?.avatar_url} size="lg" />
            <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar
                ? <Spinner size={20} />
                : <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>photo_camera</span>
              }
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <div className="flex-1">
            <div className="text-xl font-extrabold text-text tracking-tight">
              {profile?.honorific ? `${profile.honorific} ${profile.full_name}` : profile?.full_name}
            </div>
            <div className="text-sm text-text-muted mt-0.5 mb-3">{profile?.department ?? 'No department'}</div>
            <div className="flex flex-wrap gap-3">
              <StatusBadge status={status?.status ?? 'offline'} />
              {status?.location && (
                <span className="flex items-center gap-1 text-xs text-text-muted font-medium">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span>
                  {status.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowQR(!showQR)}
              className="btn-secondary text-xs py-2 px-3.5 gap-1.5"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>qr_code_2</span>
              My QR
            </button>
          </div>
        </div>

        {/* QR panel */}
        {showQR && (
          <div className="mt-5 pt-5 border-t border-border-light flex flex-col sm:flex-row items-center gap-6">
            <div className="p-4 bg-white border border-border-light rounded-xl shadow-sm">
              <QRCodeSVG value={qrPayload} size={160} level="H" includeMargin />
            </div>
            <div>
              <div className="font-bold text-sm text-text mb-1">Your Check-In QR Code</div>
              <p className="text-xs text-text-faint leading-relaxed max-w-xs">
                Show this at any campus QR terminal to instantly update your location and check in. The code is linked to your faculty ID.
              </p>
              <div className="mt-3 text-xs font-mono text-text-faint bg-surface-low rounded-lg px-3 py-2">
                ID: {profile?.id?.slice(0, 16)}…
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Update Status */}
        <div className="lg:col-span-2">
          <div className="card p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>edit_square</span>
              <h2 className="font-bold text-base text-text">Update Status</h2>
            </div>
            {/* Honorific selector */}
            <div className="flex items-end gap-3 mb-5 pb-5 border-b border-border-light">
              <div className="flex-1">
                <label className="form-label">Honorific / Title</label>
                <div className="relative">
                  <select className="form-select pr-8" value={honorific} onChange={e => setHonorific(e.target.value)}>
                    <option value="">— None —</option>
                    {HONORIFICS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
                </div>
              </div>
              <button type="button" onClick={handleHonorificSave} className="btn-secondary text-xs h-11 px-4" disabled={savingHonorific}>
                {savingHonorific ? <Spinner size={14} /> : 'Save Title'}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Availability</label>
                  <div className="relative">
                    <select
                      className="form-select pr-8"
                      value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
                  </div>
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Room 402, Library..."
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">Note <span className="text-text-faint font-normal">(optional)</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Back at 3 PM, in Project Alpha review..."
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <Spinner size={16} /> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>}
                Update Status
              </button>
            </form>
          </div>

          {/* Activity log */}
          <div className="card p-6 mt-5">
            <h2 className="font-bold text-base text-text mb-5">Activity Log</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-text-faint text-center py-8">No activity yet.</p>
            ) : (
              <div className="space-y-0 divide-y divide-border-light">
                {logs.map(log => {
                  const { icon, color } = ACTION_ICONS[log.action] ?? ACTION_ICONS.default
                  return (
                    <div key={log.id} className="flex items-start gap-3.5 py-3.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text">{log.detail}</div>
                        <div className="text-xs text-text-faint mt-0.5">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Profile meta */}
        <div className="space-y-4">
          <div className="card p-4 sm:p-5">
            <h3 className="text-xs font-bold text-text-faint uppercase tracking-widest mb-4">Profile Info</h3>
            <dl className="space-y-3.5">
              {[
                { label: 'Title', value: profile?.honorific ?? '—' },
                { label: 'Full Name', value: profile?.full_name },
                { label: 'Email', value: profile?.email },
                { label: 'Department', value: profile?.department ?? '—' },
                { label: 'Role', value: profile?.role },
                { label: 'Employee ID', value: profile?.id?.slice(0, 8).toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-[10px] font-bold text-text-faint uppercase tracking-wider">{label}</dt>
                  <dd className="text-sm font-semibold text-text mt-0.5 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-4 sm:p-5">
            <h3 className="text-xs font-bold text-text-faint uppercase tracking-widest mb-3">Last Check-In</h3>
            {status?.updated_at ? (
              <>
                <div className="text-lg font-extrabold text-text tracking-tight">
                  {formatDistanceToNow(new Date(status.updated_at), { addSuffix: true })}
                </div>
                <div className="text-xs text-text-faint mt-1">{new Date(status.updated_at).toLocaleString()}</div>
              </>
            ) : (
              <p className="text-sm text-text-faint">No check-in recorded</p>
            )}
          </div>

          {/* Account Settings */}
          <div className="card p-4 sm:p-5">
            <h3 className="text-xs font-bold text-text-faint uppercase tracking-widest mb-4">Account Settings</h3>

            {/* Change Name */}
            <form onSubmit={handleNameSave} className="mb-5 pb-5 border-b border-border-light space-y-3">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                value={nameForm.full_name}
                onChange={e => setNameForm({ full_name: e.target.value })}
                placeholder="Your full name"
              />
              <button type="submit" className="btn-secondary text-xs w-full" disabled={savingName}>
                {savingName ? <Spinner size={14} /> : 'Update Name'}
              </button>
            </form>

            {/* Change Password */}
            <form onSubmit={handlePasswordSave} className="space-y-3">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Min 6 characters"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
              />
              <input
                type="password"
                className="form-input"
                placeholder="Confirm new password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              />
              <button type="submit" className="btn-secondary text-xs w-full" disabled={savingPw}>
                {savingPw ? <Spinner size={14} /> : 'Change Password'}
              </button>
            </form>

            <p className="text-[10px] text-text-faint mt-4 text-center">
              To change your email, contact your system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
