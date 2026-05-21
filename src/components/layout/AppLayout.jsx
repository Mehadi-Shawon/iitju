import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui'
import { useNotifications } from '@/hooks/useData'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import iitLogo from '@/assets/IIT logo.png'
import juLogo from '@/assets/Jahangirnagar_University_Logo.svg.png'

const NAV = {
  admin: [
    { to: '/app/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { to: '/app/admin/users', icon: 'group', label: 'Users' },
    { to: '/app/admin/qrscan', icon: 'qr_code_scanner', label: 'QR Scanner' },
    { to: '/app/admin/activity', icon: 'history', label: 'Activity Log' },
    { to: '/app/admin/settings', icon: 'settings', label: 'Settings' },
    { to: '/app/staff/profile', icon: 'account_circle', label: 'My Profile' },
  ],
  staff: [
    { to: '/app/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { to: '/app/staff/profile', icon: 'account_circle', label: 'My Profile' },
    { to: '/app/staff/checkin', icon: 'qr_code_scanner', label: 'QR Check-In' },
    { to: '/app/staff/schedule', icon: 'calendar_month', label: 'Schedule Requests', badgeKey: 'staffSchedule' },
  ],
  student: [
    { to: '/app/dashboard', icon: 'dashboard', label: 'Faculty Directory' },
    { to: '/app/student/schedule', icon: 'calendar_add_on', label: 'Request Schedule', badgeKey: 'studentSchedule' },
  ],
}

export default function AppLayout({ children }) {
  const { profile, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications()
  const bellRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  const navItems = NAV[role] ?? NAV.student

  const badges = {
    staffSchedule: notifications.filter(n => n.type === 'schedule_request' && !n.read).length,
    studentSchedule: notifications.filter(n => (n.type === 'schedule_accepted' || n.type === 'schedule_declined') && !n.read).length,
  }

  const schedulePage = role === 'student' ? '/app/student/schedule' : '/app/staff/schedule'

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-border-light flex flex-col transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

        {/* Brand */}
        <div className="px-4 py-3 border-b border-border-light">
          <img src={iitLogo} alt="IIT Logo" className="w-full h-10 object-contain" />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <div className="text-[9px] font-bold text-text-faint uppercase tracking-widest px-3 py-2">Menu</div>
          {navItems.map(item => {
            const badge = item.badgeKey ? badges[item.badgeKey] : 0
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors duration-150
                  ${isActive ? 'bg-primary-light text-primary font-bold' : 'text-text-muted hover:bg-surface-low hover:text-text'}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Credit */}
        <div className="px-4 py-2 text-center">
          <p className="text-[8px] text-text-faint leading-relaxed">
            Design &amp; Dev by Md. Mehadi Hasan Shawon<br />
            ID: 243037 · Batch: 33<br />
            write.shawon@gmail.com
          </p>
        </div>

        {/* User */}
        <div className="p-3 border-t border-border-light space-y-1">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border border-border-light">
            <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-text truncate">{profile?.full_name ?? 'User'}</div>
              <div className="text-[10px] text-text-faint capitalize">{role === 'staff' ? 'Faculty' : role}</div>
            </div>
          </div>
          <button
            onClick={() => setConfirmSignOut(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-[10px] text-sm text-text-faint hover:bg-red-50 hover:text-red-500 transition-colors duration-150"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sign-out confirmation */}
      {confirmSignOut && (
        <div className="fixed inset-0 bg-text/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500" style={{ fontSize: 24 }}>logout</span>
            </div>
            <h3 className="text-base font-extrabold text-text mb-1">Sign Out?</h3>
            <p className="text-sm text-text-muted mb-5">Are you sure you want to sign out of FacultyTrack?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSignOut(false)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmSignOut(false); handleSignOut() }}
                className="flex-1 btn-danger"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-14 bg-white/80 backdrop-blur-md border-b border-border-light flex items-center justify-between px-3 sm:px-6">
          <button className="lg:hidden p-2 rounded-lg hover:bg-surface-low text-text-muted" onClick={() => setSidebarOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          {/* University logo centred in topbar */}
          <div className="absolute left-1/2 -translate-x-1/2 h-10 flex items-center">
            <img src={juLogo} alt="Jahangirnagar University" className="h-full w-auto object-contain" />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-1 rounded-full ${
              role === 'admin' ? 'bg-primary-light text-primary' :
              role === 'staff' ? 'bg-green-100 text-green-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {role === 'staff' ? 'FACULTY' : role?.toUpperCase()}
            </div>

            {/* Notification bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setNotifOpen(o => !o)}
                className="relative p-1.5 rounded-lg hover:bg-surface-low text-text-muted transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-border-light overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
                    <span className="font-bold text-sm text-text">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-primary font-semibold hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-border-light">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-sm text-text-faint">
                        <span className="material-symbols-outlined block text-3xl mb-2">notifications_off</span>
                        No notifications yet
                      </div>
                    ) : notifications.map(n => (
                      <NotifItem
                        key={n.id}
                        notif={n}
                        onNavigate={() => {
                          markAsRead(n.id)
                          setNotifOpen(false)
                          navigate(schedulePage)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => navigate('/app/staff/profile')} className="focus:outline-none">
              <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" className="cursor-pointer" />
            </button>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 p-3 sm:p-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

const NOTIF_ICON = {
  schedule_request:   { icon: 'calendar_add_on',  cls: 'text-primary bg-primary-light' },
  schedule_accepted:  { icon: 'event_available',   cls: 'text-green-600 bg-green-50' },
  schedule_declined:  { icon: 'event_busy',        cls: 'text-red-500 bg-red-50' },
  schedule_cancelled: { icon: 'event_busy',        cls: 'text-gray-500 bg-gray-100' },
}

function NotifItem({ notif, onNavigate }) {
  const { icon, cls } = NOTIF_ICON[notif.type] ?? NOTIF_ICON.schedule_request
  return (
    <div
      onClick={onNavigate}
      className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-surface-low transition-colors ${!notif.read ? 'bg-blue-50/50' : ''}`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-bold text-text leading-tight">{notif.title}</span>
          {!notif.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-0.5" />}
        </div>
        <div className="text-xs text-text-muted mt-0.5 leading-snug">{notif.body}</div>
        <div className="text-[10px] text-text-faint mt-1">
          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
        </div>
      </div>
    </div>
  )
}
