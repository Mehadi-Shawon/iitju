import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui'
import toast from 'react-hot-toast'
import iitLogo from '@/assets/IIT logo.png'

const NAV = {
  admin: [
    { to: '/app/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { to: '/app/admin/users', icon: 'group', label: 'Users' },
    { to: '/app/admin/activity', icon: 'history', label: 'Activity Log' },
    { to: '/app/admin/settings', icon: 'settings', label: 'Settings' },
  ],
  staff: [
    { to: '/app/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { to: '/app/staff/profile', icon: 'account_circle', label: 'My Profile' },
    { to: '/app/staff/checkin', icon: 'qr_code_scanner', label: 'QR Check-In' },
  ],
  student: [
    { to: '/app/dashboard', icon: 'dashboard', label: 'Faculty Directory' },
  ],
}

export default function AppLayout({ children }) {
  const { profile, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  const navItems = NAV[role] ?? NAV.student

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
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors duration-150
                ${isActive ? 'bg-primary-light text-primary font-bold' : 'text-text-muted hover:bg-surface-low hover:text-text'}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

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
            onClick={handleSignOut}
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

      {/* Main */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-14 bg-white/80 backdrop-blur-md border-b border-border-light flex items-center justify-between px-3 sm:px-6">
          <button className="lg:hidden p-2 rounded-lg hover:bg-surface-low text-text-muted" onClick={() => setSidebarOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-1 rounded-full ${
              role === 'admin' ? 'bg-primary-light text-primary' :
              role === 'staff' ? 'bg-green-100 text-green-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {role === 'staff' ? 'FACULTY' : role?.toUpperCase()}
            </div>
            <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" className="cursor-pointer" />
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
