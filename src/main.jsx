import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem', fontFamily: 'system-ui, sans-serif',
          maxWidth: 600, margin: '4rem auto'
        }}>
          <h2 style={{ color: '#c00', marginBottom: '0.5rem' }}>Something went wrong</h2>
          <pre style={{
            background: '#fff0f0', border: '1px solid #fcc', borderRadius: 8,
            padding: '1rem', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            style={{
              marginTop: '1rem', padding: '0.5rem 1.25rem', background: '#4648d4',
              color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14
            }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
