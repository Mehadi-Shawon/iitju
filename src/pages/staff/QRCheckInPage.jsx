import { useState, useEffect, useRef } from 'react'
import { useMyStatus } from '@/hooks/useData'
import { useAuth } from '@/context/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import { PageHeader } from '@/components/ui'
import toast from 'react-hot-toast'

export default function QRCheckInPage() {
  const { profile } = useAuth()
  const { status, checkInViaQR } = useMyStatus()
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const scannerRef = useRef(null)

  const qrPayload = JSON.stringify({ staffId: profile?.id, name: profile?.full_name })

  async function handleManualCheckIn() {
    const { error } = await checkInViaQR()
    if (error) return toast.error('Check-in failed: ' + error.message)
    toast.success('Checked in! Status set to Available.')
  }

  // html5-qrcode scanner
  async function startScanner() {
    const { Html5Qrcode } = await import('html5-qrcode')
    setScanning(true)
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 200 },
        async (decodedText) => {
          try {
            const data = JSON.parse(decodedText)
            setScanResult(data)
            await scanner.stop()
            setScanning(false)
            toast.success(`QR scanned: ${data.name ?? data.staffId}`)
          } catch {
            toast.error('Invalid QR code')
          }
        },
        () => {}
      )
    } catch (err) {
      setScanning(false)
      toast.error('Camera access denied. Use manual check-in.')
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {})
      setScanning(false)
    }
  }

  useEffect(() => () => { stopScanner() }, [])

  return (
    <div>
      <PageHeader title="QR Check-In" subtitle="Scan or show your QR code at any campus terminal" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My QR */}
        <div className="card p-5 sm:p-7 flex flex-col items-center text-center">
          <div className="text-sm font-bold text-text mb-1">My Check-In QR Code</div>
          <p className="text-xs text-text-faint mb-6">Show this at any campus terminal</p>
          <div className="p-5 bg-white border border-border-light rounded-xl shadow-sm mb-5">
            <QRCodeSVG value={qrPayload} size={200} level="H" includeMargin />
          </div>
          <div className="text-xs text-text-faint font-mono bg-surface-low rounded-lg px-3 py-2 mb-5 max-w-full break-all">
            {profile?.full_name} · {profile?.id?.slice(0, 12)}…
          </div>
          <button onClick={handleManualCheckIn} className="btn-primary gap-2 w-full max-w-xs">
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

        {/* Scanner */}
        <div className="card p-5 sm:p-7 flex flex-col items-center text-center">
          <div className="text-sm font-bold text-text mb-1">Scan Staff QR</div>
          <p className="text-xs text-text-faint mb-6">Admin/kiosk mode: scan another staff's QR</p>

          <div id="qr-reader" className={`w-full max-w-xs rounded-xl overflow-hidden bg-black mb-5 ${scanning ? 'block' : 'hidden'}`} style={{ minHeight: 250 }} />

          {!scanning && !scanResult && (
            <div className="w-full max-w-xs h-52 rounded-xl bg-surface-low border-2 border-dashed border-border flex flex-col items-center justify-center mb-5 gap-2">
              <span className="material-symbols-outlined text-text-faint" style={{ fontSize: 40 }}>qr_code_scanner</span>
              <p className="text-xs text-text-faint">Camera preview appears here</p>
            </div>
          )}

          {scanResult && (
            <div className="w-full max-w-xs rounded-xl bg-green-50 border border-green-200 p-4 mb-5 text-left">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-green-600" style={{ fontSize: 18 }}>check_circle</span>
                <span className="text-sm font-bold text-green-700">Scan Successful</span>
              </div>
              <div className="text-xs text-green-700">Name: <strong>{scanResult.name}</strong></div>
              <div className="text-xs text-green-600 font-mono mt-0.5">{scanResult.staffId}</div>
              <button onClick={() => setScanResult(null)} className="mt-3 text-xs text-green-700 font-bold underline">
                Scan another
              </button>
            </div>
          )}

          {scanning ? (
            <button onClick={stopScanner} className="btn-danger w-full max-w-xs">
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>stop</span>
              Stop Scanner
            </button>
          ) : (
            <button onClick={startScanner} className="btn-secondary w-full max-w-xs">
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>photo_camera</span>
              Open Camera
            </button>
          )}
          <p className="text-[10px] text-text-faint mt-3">Requires camera permission</p>
        </div>
      </div>
    </div>
  )
}
