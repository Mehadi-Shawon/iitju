import { useState } from 'react'
import { PageHeader } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

export default function AdminSettingsPage() {
  const { profile } = useAuth()
  const [systemName, setSystemName] = useState('FacultyTrack')
  const [institution, setInstitution] = useState('University Campus')

  function handleSave(e) {
    e.preventDefault()
    toast.success('Settings saved')
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="System configuration and preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* System */}
          <div className="card p-4 sm:p-6">
            <h2 className="font-bold text-base text-text mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 19 }}>settings</span>
              System Settings
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="form-label">System Name</label>
                <input className="form-input" value={systemName} onChange={e => setSystemName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Institution / Campus Name</label>
                <input className="form-input" value={institution} onChange={e => setInstitution(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary">Save Settings</button>
            </form>
          </div>

          {/* Supabase info */}
          <div className="card p-4 sm:p-6">
            <h2 className="font-bold text-base text-text mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 19 }}>database</span>
              Supabase Connection
            </h2>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Project URL', value: import.meta.env.VITE_SUPABASE_URL || 'Not configured' },
                { label: 'Auth', value: 'Supabase Auth (email + student ID)' },
                { label: 'Realtime', value: 'faculty_status + activity_log' },
                { label: 'RLS', value: 'Enabled — role-based policies' },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-3 py-2.5 border-b border-border-light last:border-0">
                  <span className="text-text-faint font-medium w-32 shrink-0">{label}</span>
                  <span className="font-mono text-xs text-text break-all">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3.5 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700 font-medium">
              ✓ Copy <code className="bg-green-100 px-1 rounded">.env.example</code> → <code className="bg-green-100 px-1 rounded">.env</code> and fill in your Supabase URL and anon key to connect.
            </div>
          </div>
        </div>

        {/* Admin info */}
        <div className="space-y-4">
          <div className="card p-4 sm:p-5">
            <h3 className="text-xs font-bold text-text-faint uppercase tracking-widest mb-4">Logged-In Admin</h3>
            <dl className="space-y-3">
              {[
                { label: 'Name', value: profile?.full_name },
                { label: 'Email', value: profile?.email },
                { label: 'Role', value: profile?.role },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-[10px] font-bold text-text-faint uppercase tracking-wider">{label}</dt>
                  <dd className="text-sm font-semibold text-text mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-4 sm:p-5">
            <h3 className="text-xs font-bold text-text-faint uppercase tracking-widest mb-3">Quick Setup Guide</h3>
            <ol className="space-y-2.5 text-xs text-text-muted">
              {[
                'Create a Supabase project',
                'Run the SQL schema from src/lib/supabase.js',
                'Copy .env.example → .env',
                'Add your project URL + anon key',
                'Create your first admin user in Supabase Auth with role=admin in user_metadata',
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary-light text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
