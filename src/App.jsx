import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import AppRouter from '@/AppRouter'
import '@/index.css'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(17,28,45,0.12)',
            },
            success: { iconTheme: { primary: '#4648d4', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
