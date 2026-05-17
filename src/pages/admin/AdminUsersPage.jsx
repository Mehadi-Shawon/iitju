import { useState } from 'react'
import { useAdminUsers } from '@/hooks/useData'
import { StatusBadge, Avatar, PageHeader, Modal, LoadingPage, EmptyState, Spinner } from '@/components/ui'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const ROLE_TABS = ['all', 'staff', 'student', 'admin']
const ROLE_LABELS = { all: 'All', staff: 'Faculty', student: 'Student', admin: 'Admin' }

export default function AdminUsersPage() {
  const { users, loading, createStaffUser, createStudentUser, deleteUser, overrideStaffStatus, updateUserRole, updateHonorific } = useAdminUsers()
  const [roleTab, setRoleTab] = useState('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(null) // 'staff' | 'student' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null)

  const filtered = users.filter(u => {
    const matchRole = roleTab === 'all' || u.role === roleTab
    const matchSearch = !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  function openEdit(user) { setSelected(user); setModalOpen('edit') }
  function openDelete(user) { setSelected(user); setModalOpen('delete') }
  function closeModal() { setModalOpen(null); setSelected(null) }

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Create and manage faculty, student and admin accounts"
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" onClick={() => setModalOpen('student')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>school</span>
              <span className="hidden sm:inline">Add Student</span>
              <span className="sm:hidden">Student</span>
            </button>
            <button className="btn-primary text-xs" onClick={() => setModalOpen('staff')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
              <span className="hidden sm:inline">Add Faculty</span>
              <span className="sm:hidden">Faculty</span>
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 sm:max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" style={{ fontSize: 17 }}>search</span>
          <input className="form-input pl-9" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ROLE_TABS.map(r => (
            <button key={r} onClick={() => setRoleTab(r)}
              className={`px-3 py-2 rounded-full text-xs font-bold border transition-all
                ${roleTab === r ? 'bg-primary text-white border-primary' : 'bg-white text-text-muted border-border hover:border-primary hover:text-primary'}`}>
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-5">
        {[
          { label: 'Total', value: users.length },
          { label: 'Faculty', value: users.filter(u => u.role === 'staff').length },
          { label: 'Students', value: users.filter(u => u.role === 'student').length },
        ].map(s => (
          <div key={s.label} className="card p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">{s.value}</div>
            <div className="text-[9px] sm:text-[10px] font-bold text-text-faint uppercase tracking-widest mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* User list */}
      {loading ? <LoadingPage /> : filtered.length === 0 ? (
        <EmptyState icon="group_off" title="No users found" description="Try a different filter or add new users." />
      ) : (
        <>
          {/* ── Mobile cards (< md) ── */}
          <div className="md:hidden space-y-2">
            {filtered.map(u => {
              const st = u.staff_status?.[0]
              return (
                <div key={u.id} className="card p-4 flex items-start gap-3">
                  <Avatar name={u.full_name} src={u.avatar_url} size="sm" className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-text truncate">
                          {u.honorific ? `${u.honorific} ${u.full_name}` : u.full_name}
                        </div>
                        <div className="text-xs text-text-faint truncate">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-low hover:text-primary transition-colors">
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                        </button>
                        <button onClick={() => openDelete(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors">
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <RoleBadge role={u.role} />
                      {u.role === 'staff' && <StatusBadge status={st?.status ?? 'offline'} />}
                      {st?.location && (
                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>location_on</span>
                          {st.location}
                        </span>
                      )}
                    </div>
                    {st?.updated_at && (
                      <div className="text-[11px] text-text-faint mt-1">
                        {formatDistanceToNow(new Date(st.updated_at), { addSuffix: true })}
                      </div>
                    )}
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
                    {['User', 'Role', 'Status', 'Location', 'Last Active', 'Actions'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => {
                    const st = u.staff_status?.[0]
                    return (
                      <tr key={u.id} className="border-b border-border-light last:border-0 hover:bg-surface transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.full_name} src={u.avatar_url} size="sm" />
                            <div>
                              <div className="text-sm font-bold text-text">
                                {u.honorific ? `${u.honorific} ${u.full_name}` : u.full_name}
                              </div>
                              <div className="text-xs text-text-faint">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                        <td className="px-5 py-3.5">
                          {u.role === 'staff' ? <StatusBadge status={st?.status ?? 'offline'} /> : <span className="text-xs text-text-faint">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-text-muted">{st?.location || '—'}</td>
                        <td className="px-5 py-3.5 text-xs text-text-faint font-mono">
                          {st?.updated_at ? formatDistanceToNow(new Date(st.updated_at), { addSuffix: true }) : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-low hover:text-primary transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                            </button>
                            <button onClick={() => openDelete(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                            </button>
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

      {/* Modals */}
      <CreateStaffModal open={modalOpen === 'staff'} onClose={closeModal} onCreate={createStaffUser} />
      <CreateStudentModal open={modalOpen === 'student'} onClose={closeModal} onCreate={createStudentUser} />
      {selected && <EditUserModal open={modalOpen === 'edit'} onClose={closeModal} user={selected} onOverride={overrideStaffStatus} onRoleChange={updateUserRole} onHonoricChange={updateHonorific} />}
      {selected && <DeleteUserModal open={modalOpen === 'delete'} onClose={closeModal} user={selected} onDelete={deleteUser} />}
    </div>
  )
}

function RoleBadge({ role }) {
  const styles = { admin: 'bg-primary-light text-primary', staff: 'bg-green-100 text-green-700', student: 'bg-amber-100 text-amber-700' }
  const labels = { admin: 'Admin', staff: 'Faculty', student: 'Student' }
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${styles[role] ?? ''}`}>{labels[role] ?? role}</span>
}

const HONORIFICS = ['Prof.', 'Assoc. Prof.', 'Asst. Prof.', 'Dr.', 'Lecturer', 'Director', 'Chairman', 'Mr.', 'Ms.', 'Mrs.']

function CreateStaffModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState({ full_name: '', email: '', department: '', password: '', honorific: '' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await onCreate(form)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(`Account created for ${form.honorific ? form.honorific + ' ' : ''}${form.full_name}`)
    setForm({ full_name: '', email: '', department: '', password: '', honorific: '' })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Faculty Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Honorific / Title</label>
            <div className="relative">
              <select className="form-select pr-8" value={form.honorific} onChange={set('honorific')}>
                <option value="">— None —</option>
                {HONORIFICS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
            </div>
          </div>
          <div>
            <label className="form-label">Full Name</label>
            <input className="form-input" required placeholder="e.g. Jane Smith" value={form.full_name} onChange={set('full_name')} />
          </div>
        </div>
        <div>
          <label className="form-label">Email</label>
          <input type="email" className="form-input" required placeholder="jane@university.edu" value={form.email} onChange={set('email')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Department</label>
            <input className="form-input" placeholder="e.g. Engineering" value={form.department} onChange={set('department')} />
          </div>
          <div>
            <label className="form-label">Temp Password</label>
            <input type="password" className="form-input" required placeholder="Min 8 chars" value={form.password} onChange={set('password')} />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? <Spinner size={16} /> : 'Create Faculty Account'}
        </button>
      </form>
    </Modal>
  )
}

function CreateStudentModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState({ full_name: '', student_id: '', department: '' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await onCreate(form)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(`Student account created for ${form.full_name}`)
    setForm({ full_name: '', student_id: '', department: '' })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Student Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="form-label">Full Name</label>
          <input className="form-input" required placeholder="e.g. John Doe" value={form.full_name} onChange={set('full_name')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Student ID</label>
            <input className="form-input" required placeholder="STU-2024-0042" value={form.student_id} onChange={set('student_id')} />
          </div>
          <div>
            <label className="form-label">Department</label>
            <input className="form-input" placeholder="e.g. CS Dept." value={form.department} onChange={set('department')} />
          </div>
        </div>
        <p className="text-xs text-text-faint bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
          Student logs in with their Student ID. Password is set to their ID by default.
        </p>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? <Spinner size={16} /> : 'Create Student Account'}
        </button>
      </form>
    </Modal>
  )
}

function EditUserModal({ open, onClose, user, onOverride, onRoleChange, onHonoricChange }) {
  const [status, setStatus] = useState(user.staff_status?.[0]?.status ?? 'offline')
  const [location, setLocation] = useState(user.staff_status?.[0]?.location ?? '')
  const [role, setRole] = useState(user.role)
  const [honorific, setHonorific] = useState(user.honorific ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    if (user.role !== role) await onRoleChange(user.id, role)
    if (user.honorific !== honorific) await onHonoricChange(user.id, honorific)
    if (user.role === 'staff') await onOverride(user.id, status, location)
    setSaving(false)
    toast.success('User updated')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit — ${user.full_name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Honorific / Title</label>
            <div className="relative">
              <select className="form-select pr-8" value={honorific} onChange={e => setHonorific(e.target.value)}>
                <option value="">— None —</option>
                {HONORIFICS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
            </div>
          </div>
          <div>
            <label className="form-label">Role</label>
            <div className="relative">
              <select className="form-select pr-8" value={role} onChange={e => setRole(e.target.value)}>
                <option value="staff">Faculty / Staff</option>
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
            </div>
          </div>
        </div>
        {user.role === 'staff' && (
          <>
            <div>
              <label className="form-label">Override Status</label>
              <div className="relative">
                <select className="form-select pr-8" value={status} onChange={e => setStatus(e.target.value)}>
                  {[
                    { value: 'available',  label: 'Available' },
                    { value: 'meeting',    label: 'In Meeting' },
                    { value: 'in-class',   label: 'In Class' },
                    { value: 'in-lab',     label: 'In Lab' },
                    { value: 'on-break',   label: 'On Break' },
                    { value: 'busy',       label: 'Busy' },
                    { value: 'away',       label: 'Away' },
                    { value: 'off-campus', label: 'Off Campus' },
                    { value: 'on-leave',   label: 'On Leave' },
                    { value: 'offline',    label: 'Offline' },
                  ].map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" style={{ fontSize: 16 }}>expand_more</span>
              </div>
            </div>
            <div>
              <label className="form-label">Override Location</label>
              <input className="form-input" placeholder="Force set location..." value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </>
        )}
        <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size={16} /> : 'Save Changes'}
        </button>
      </div>
    </Modal>
  )
}

function DeleteUserModal({ open, onClose, user, onDelete }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const { error } = await onDelete(user.id)
    setDeleting(false)
    if (error) return toast.error(error.message)
    toast.success(`${user.full_name} deleted`)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete User">
      <div className="text-center py-2">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-red-500" style={{ fontSize: 28 }}>delete_forever</span>
        </div>
        <p className="text-sm text-text mb-1">You're about to permanently delete</p>
        <p className="font-bold text-text mb-5">{user.full_name}</p>
        <p className="text-xs text-text-faint mb-6">This will remove their account, profile, and all status history. This cannot be undone.</p>
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-danger flex-1" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Spinner size={16} /> : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
