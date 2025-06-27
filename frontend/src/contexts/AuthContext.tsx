import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'
import type { AuthContextType, User, LoginCredentials, RegisterCredentials, SitePasswordCredentials } from '../types/auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Check authentication status on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      setIsLoading(true)
      const { authenticated, user } = await authService.getAuthStatus()
      setIsAuthenticated(authenticated)
      setUser(user)
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authService.login(credentials)
      
      if (response.success && response.user) {
        setUser(response.user)
        setIsAuthenticated(true)
        toast.success('Successfully logged in!')
        return response
      } else {
        toast.error(response.error || 'Login failed')
        return response
      }
    } catch (error) {
      const errorMessage = 'An error occurred during login'
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const loginWithSitePassword = async (credentials: SitePasswordCredentials) => {
    try {
      const response = await authService.loginWithSitePassword(credentials)
      
      if (response.success && response.user) {
        setUser(response.user)
        setIsAuthenticated(true)
        toast.success('Successfully logged in!')
        return response
      } else {
        toast.error(response.error || 'Login failed')
        return response
      }
    } catch (error) {
      const errorMessage = 'An error occurred during login'
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const register = async (credentials: RegisterCredentials) => {
    try {
      const response = await authService.register(credentials)
      
      if (response.success) {
        if (response.user) {
          // User was auto-approved and logged in
          setUser(response.user)
          setIsAuthenticated(true)
          toast.success(response.message || 'Account created successfully!')
        } else if (response.requiresApproval) {
          // User needs approval
          toast.success(response.message || 'Account created! Please wait for approval.')
        }
        return response
      } else {
        toast.error(response.error || 'Registration failed')
        return response
      }
    } catch (error) {
      const errorMessage = 'An error occurred during registration'
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
      setUser(null)
      setIsAuthenticated(false)
      toast.success('Successfully logged out')
    } catch (error) {
      console.error('Logout error:', error)
      // Still clear local state even if API call fails
      setUser(null)
      setIsAuthenticated(false)
    }
  }

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    loginWithSitePassword,
    register,
    logout,
    checkAuth,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 