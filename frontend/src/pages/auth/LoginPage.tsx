import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import SitePasswordForm from '../../components/auth/SitePasswordForm'
import LocalLoginForm from '../../components/auth/LocalLoginForm'
import RegisterForm from '../../components/auth/RegisterForm'
import ThemeToggle from '../../components/ui/ThemeToggle'

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<'site' | 'local' | 'register'>('site')

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner h-8 w-8"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            ToadBox Bingo
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Choose your login method to get started
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          {/* Tab Selector */}
          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-6">
            <button
              onClick={() => setActiveTab('site')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'site'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Quick Access
            </button>
            <button
              onClick={() => setActiveTab('local')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'local'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'register'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form Content */}
          <div>
            {activeTab === 'site' && <SitePasswordForm />}
            {activeTab === 'local' && <LocalLoginForm />}
            {activeTab === 'register' && <RegisterForm />}
          </div>
        </div>
      </div>
    </div>
  )
} 