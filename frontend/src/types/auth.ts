export interface User {
  userId: string
  username: string
  email?: string
  isAdmin?: boolean
  authProvider?: string
  approvalStatus?: 'pending' | 'approved' | 'rejected'
}

export interface AuthResponse {
  success: boolean
  user?: User
  error?: string
  message?: string
  requiresApproval?: boolean
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  username: string
  email: string
  password: string
}

export interface SitePasswordCredentials {
  sitePassword: string
  username?: string
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<AuthResponse>
  loginWithSitePassword: (credentials: SitePasswordCredentials) => Promise<AuthResponse>
  register: (credentials: RegisterCredentials) => Promise<AuthResponse>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export interface AuthConfig {
  methods: string[]
  registration: {
    enabled: boolean
    requiresApproval: boolean
  }
  google?: {
    clientId: string
  }
  discord?: {
    clientId: string
    redirectUri: string
  }
} 