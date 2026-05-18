import { useState, useRef, useEffect } from 'react'
import { PageHeader } from '@/components/ui'
import toast from 'react-hot-toast'

export default function AdminQRScanPage() {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const scannerRef = useRef(null)

  async function startScanner() {
    const { Html5Qrcode } = await import('html5-qrcode')
    setScanning(true)
    const scanner = new Html5Qrcode('admin-qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        async (decodedText) => {
          try {
            const data = JSON.parse(decodedText)
            setScanResult(data)
            await scanner.stop()
            setScanning(false)
            toast.success(`Scanned: ${data.name ?? data.staffId ?? 'Unknown'}`)
          } catch {
            toast.error('Invalid QR code')
          }
        },
        () => {}
      )
    } catch {
      setScanning(false)
      toast.error('Camera access denied.')
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
      <PageHeader title="QR Scanner" subtitle="Scan faculty QR codes to verify presence" />

      <div className="max-w-sm mx-auto">
        <div className="card p-5 sm:p-7 flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-primary mb-3" style={{ fontSize: 40 }}>qr_code_scanner</span>
          <div className="text-sm font-bold text-text mb-1">Scan Faculty QR</div>
          <p className="text-xs text-text-faint mb-6">Point camera at a faculty member's QR code</p>

          <div
            id="admin-qr-reader"
            className={`w-full rounded-xl overflow-hidden bg-black mb-5 ${scanning ? 'block' : 'hidden'}`}
            style={{ minHeight: 260 }}
          />

          {!scanning && !scanResult && (
            <div className="w-full h-52 rounded-xl bg-surface-low border-2 border-dashed border-border flex flex-col items-center justify-center mb-5 gap-2">
              <span className="material-symbols-outlined text-text-faint" style={{ fontSize: 48 }}>photo_camera</span>
              <p className="text-xs text-text-faint">Camera preview appears here</p>
            </div>
          )}

          {scanResult && (
            <div className="w-full rounded-xl bg-green-50 border border-green-200 p-5 mb-5 text-left">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-green-600" style={{ fontSize: 20 }}>check_circle</span>
                <span className="text-sm font-bold text-green-700">Scan Successful</span>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-semibold text-green-800">{scanResult.name ?? '—'}</div>
                <div className="text-xs text-green-600 font-mono">{scanResult.staffId}</div>
              </div>
              <button
                onClick={() => setScanResult(null)}
                className="mt-4 btn-secondary text-xs w-full"
              >
                Scan Another
              </button>
            </div>
          )}

          {scanning ? (
            <button onClick={stopScanner} className="btn-danger w-full">
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>stop</span>
              Stop Scanner
            </button>
          ) : (
            <button onClick={startScanner} className="btn-primary w-full">
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>photo_camera</span>
              Open Camera
            </button>
          )}
          <p className="text-[11px] text-text-faint mt-3">Requires camera permission</p>
        </div>
      </div>
    </div>
  )
}
