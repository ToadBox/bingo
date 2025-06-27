import api, { handleApiError } from './api'
import { logger } from '../utils/logger'
import type { 
  User, 
  AuthResponse, 
  LoginCredentials, 
  RegisterCredentials, 
  SitePasswordCredentials,
  AuthConfig 
} from '../types/auth'

export const authService = {
  // Check authentication status
  async getAuthStatus(): Promise<{ authenticated: boolean; user: User | null }> {
    try {
      const response = await api.get('/auth/status')
      return {
        authenticated: response.data.authenticated,
        user: response.data.user || null,
      }
    } catch (error) {
      return {
        authenticated: false,
        user: null,
      }
    }
  },

  // Get auth configuration
  async getAuthConfig(): Promise<AuthConfig> {
    try {
      const response = await api.get('/auth/config')
      return response.data
    } catch (error) {
      logger.auth.error('Failed to get auth config', { error })
      return {
        methods: ['site_password', 'local'],
        registration: {
          enabled: true,
          requiresApproval: true
        }
      }
    }
  },

  // Local account login
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post('/auth/local-login', credentials)
      return {
        success: true,
        user: response.data.user,
        message: response.data.message,
      }
    } catch (error) {
      return {
        success: false,
        error: handleApiError(error),
      }
    }
  },

  // Site password login
  async loginWithSitePassword(credentials: SitePasswordCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post('/auth/login', credentials)
      return {
        success: true,
        user: response.data.user,
        message: response.data.message,
      }
    } catch (error) {
      return {
        success: false,
        error: handleApiError(error),
      }
    }
  },

  // Register new account
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post('/auth/register', {
        ...credentials,
        method: 'local'
      })
      return {
        success: true,
        user: response.data.user,
        message: response.data.message,
        requiresApproval: response.data.requiresApproval,
      }
    } catch (error) {
      return {
        success: false,
        error: handleApiError(error),
      }
    }
  },

  // Google OAuth login
  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    try {
      const response = await api.post('/auth/google', { idToken })
      return {
        success: response.data.success,
        user: response.data.user,
      }
    } catch (error) {
      return {
        success: false,
        error: handleApiError(error),
      }
    }
  },

  // Logout
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      logger.auth.error('Logout error', { error })
    }
  },

  // Get user info
  async getUserInfo(): Promise<User | null> {
    try {
      const response = await api.get('/auth/user')
      return response.data
    } catch (error) {
      return null
    }
  },
} 