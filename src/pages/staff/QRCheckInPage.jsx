import { useMyStatus } from '@/hooks/useData'
import { useAuth } from '@/context/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import { PageHeader } from '@/components/ui'
import toast from 'react-hot-toast'

export default function QRCheckInPage() {
  const { profile } = useAuth()
  const { status, checkInViaQR } = useMyStatus()

  const qrPayload = JSON.stringify({ staffId: profile?.id, name: profile?.full_name })

  async function handleManualCheckIn() {
    const { error } = await checkInViaQR()
    if (error) return toast.error('Check-in failed: ' + error.message)
    toast.success('Checked in! Status set to Available.')
  }

  return (
    <div>
      <PageHeader title="QR Check-In" subtitle="Show your QR code at any campus terminal to check in" />

      <div className="max-w-sm mx-auto">
        <div className="card p-5 sm:p-7 flex flex-col items-center text-center">
          <div className="text-sm font-bold text-text mb-1">My Check-In QR Code</div>
          <p className="text-xs text-text-faint mb-6">Show this at any campus terminal</p>
          <div className="p-5 bg-white border border-border-light rounded-xl shadow-sm mb-5">
            <QRCodeSVG value={qrPayload} size={200} level="H" includeMargin />
          </div>
          <div className="text-xs text-text-faint font-mono bg-surface-low rounded-lg px-3 py-2 mb-5 max-w-full break-all">
            {profile?.full_name} · {profile?.id?.slice(0, 12)}…
          </div>
          <button onClick={handleManualCheckIn} className="btn-primary gap-2 w-full">
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>login</span>
            Manual Check-In
          </button>
          {status && (
            <p className="text-xs text-text-faint mt-4">
              Current status: <span className="font-bold text-text capitalize">{status.status}</span>
              {status.location ? ` · ${status.location}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
