import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children }) => {
  const [hasError, setHasError] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setError(event.error || new Error(event.message))
      setHasError(true)
      toast.error('An unexpected error occurred')
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  if (hasError && error) {
    return (
      <div className="p-6 m-4 bg-red-50 border border-red-200 rounded-lg max-w-lg mx-auto">
        <h3 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h3>
        <p className="text-red-600 break-all whitespace-pre-wrap text-sm">{error.message}</p>
        <button
          onClick={() => {
            setHasError(false)
            setError(null)
            window.location.reload()
          }}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Reload Page
        </button>
      </div>
    )
  }

  return <>{children}</>
}

export default ErrorBoundary 