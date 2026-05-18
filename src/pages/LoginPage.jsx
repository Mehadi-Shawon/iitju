import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/ui'
import toast from 'react-hot-toast'
import iitLogo from '@/assets/IIT logo.png'

export default function LoginPage() {
  const { signIn, signInWithStudentId } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('staff')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [studentId, setStudentId] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleStaffLogin(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn({ email, password })
    setLoading(false)
    if (error) return toast.error(error.message)
    navigate('/app/dashboard')
  }

  async function handleStudentLogin(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await signInWithStudentId(studentId)
    setLoading(false)
    if (error) return toast.error('Invalid Student ID. Contact admin.')
    navigate('/app/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0f1535]">

      {/* Background decorative blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/30 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/10 blur-[160px] pointer-events-none" />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl overflow-hidden"
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >

          {/* Card header — logo + branding */}
          <div className="flex flex-col items-center pt-8 pb-7 border-b border-white/15 bg-white/[0.04]">
            <img src={iitLogo} alt="IIT Logo" className="w-full object-contain max-h-20 px-6" />
            <div className="mt-5 text-center">
              <h1 className="text-white text-xl font-extrabold tracking-tight">FacultyTrack</h1>
              <p className="text-white/40 text-xs font-medium mt-0.5 uppercase tracking-widest">
                University Campus System
              </p>
            </div>
          </div>

          {/* Card body — form */}
          <div className="px-8 py-7">

            {/* Tab switcher */}
            <div className="flex bg-white/[0.08] rounded-xl p-1 gap-1 mb-6 border border-white/10">
              {[{ id: 'staff', label: 'Faculty / Admin' }, { id: 'student', label: 'Student' }].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                    ${tab === t.id
                      ? 'bg-primary text-white shadow-md shadow-primary/40'
                      : 'text-white/50 hover:text-white/80'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Faculty / Admin login */}
            {tab === 'staff' && (
              <form onSubmit={handleStaffLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 tracking-wide uppercase">
                    Email Address
                  </label>
                  <input
                    type="email" required
                    placeholder="you@university.edu"
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full h-11 rounded-xl bg-white/[0.08] border border-white/20 px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-primary/70 focus:bg-white/15 focus:ring-2 focus:ring-primary/20 backdrop-blur-sm"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-white/60 tracking-wide uppercase">Password</label>
                    <a href="#" className="text-xs text-primary/80 hover:text-primary font-semibold transition">Forgot?</a>
                  </div>
                  <input
                    type="password" required
                    placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full h-11 rounded-xl bg-white/[0.08] border border-white/20 px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-primary/70 focus:bg-white/15 focus:ring-2 focus:ring-primary/20 backdrop-blur-sm"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full h-11 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-sm shadow-lg shadow-primary/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? <Spinner size={16} /> : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>login</span>
                      Sign In
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Student login */}
            {tab === 'student' && (
              <form onSubmit={handleStudentLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 tracking-wide uppercase">
                    Student ID
                  </label>
                  <input
                    type="text" required
                    placeholder="e.g. STU-2024-0042"
                    value={studentId} onChange={e => setStudentId(e.target.value)}
                    className="w-full h-11 rounded-xl bg-white/[0.08] border border-white/20 px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-primary/70 focus:bg-white/15 focus:ring-2 focus:ring-primary/20 backdrop-blur-sm"
                  />
                </div>
                <div className="flex items-start gap-2.5 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3.5 py-3">
                  <span className="material-symbols-outlined text-amber-400 shrink-0" style={{ fontSize: 16, marginTop: 1 }}>info</span>
                  <p className="text-xs text-amber-200/80 leading-relaxed">
                    Your account is created by admin. Contact admin if you can't log in.
                  </p>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full h-11 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-sm shadow-lg shadow-primary/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? <Spinner size={16} /> : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>school</span>
                      Access Dashboard
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Card footer */}
          <div className="px-8 py-4 border-t border-white/15 bg-white/[0.04] text-center space-y-1">
            <p className="text-white/25 text-[11px] font-medium tracking-widest uppercase">
              © 2026 FacultyTrack · Smart Campus Management
            </p>
            <p className="text-white/20 text-[10px]">
              Design &amp; Developed by Md. Mehadi Hasan Shawon &nbsp;|&nbsp; ID: 243037 &nbsp;|&nbsp; Batch: 33
            </p>
            <p className="text-white/20 text-[10px]">write.shawon@gmail.com</p>
          </div>
        </div>
      </div>
    </div>
  )
}
