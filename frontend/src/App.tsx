import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { useAuth } from './hooks/useAuth'

// Components
import Layout from './components/layout/Layout'
import AuthGuard from './components/auth/AuthGuard'

// Pages
import LoginPage from './pages/auth/LoginPage'
import HomePage from './pages/HomePage'
import BoardsPage from './pages/boards/BoardsPage'
import BoardPage from './pages/boards/BoardPage'
import CreateBoardPage from './pages/boards/CreateBoardPage'
import AdminPage from './pages/admin/AdminPage'
import NotFoundPage from './pages/NotFoundPage'

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="loading-spinner h-8 w-8"></div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />} />
      
      {/* Protected routes */}
      <Route path="/" element={<AuthGuard><Layout><HomePage /></Layout></AuthGuard>} />
      <Route path="/boards" element={<AuthGuard><Layout><BoardsPage /></Layout></AuthGuard>} />
      <Route path="/boards/create" element={<AuthGuard><Layout><CreateBoardPage /></Layout></AuthGuard>} />
      <Route path="/board/:boardId" element={<AuthGuard><Layout><BoardPage /></Layout></AuthGuard>} />
      <Route path="/:username/:boardSlug" element={<AuthGuard><Layout><BoardPage /></Layout></AuthGuard>} />
      <Route path="/anonymous/:boardSlug" element={<AuthGuard><Layout><BoardPage /></Layout></AuthGuard>} />
      <Route path="/admin" element={<AuthGuard adminOnly><Layout><AdminPage /></Layout></AuthGuard>} />
      
      {/* 404 route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function App() {
  useEffect(() => {
    // Initialize theme on app load
    const isDark = localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <AppRoutes />
        </div>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App 