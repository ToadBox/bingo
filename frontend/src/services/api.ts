import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosRequestHeaders } from 'axios'
import toast from 'react-hot-toast'

/**
 * Unified API client – wraps Axios instance and exposes convenient helper
 * methods while preserving the previous public interface (`api.get`, `.post`, etc.).
 * This prevents duplication of request logic across services and keeps the
 * migration to the roadmap-proposed ApiClient incremental.
 */
class ApiClient {
  private instance: AxiosInstance

  constructor(baseURL: string = '/api') {
    this.instance = axios.create({
      baseURL,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

    // Request interceptor – add future auth headers / request-id correlation here
    this.instance.interceptors.request.use(
  (config) => {
        // Example: propagate storage-saved auth token if present
        const token = localStorage.getItem('sessionToken')
        if (token) {
          config.headers = {
            ...(config.headers as Record<string, string> | undefined),
            Authorization: `Bearer ${token}`,
          } as unknown as AxiosRequestHeaders
        }
    return config
  },
      (error) => Promise.reject(error),
    )

    // Response interceptor – global error notifications & redirects
    this.instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        handleGlobalAxiosError(error)
    return Promise.reject(error)
      },
    )
  }

  /** Low-level request helper */
  request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.instance.request<T>(config)
  }

  // Convenience HTTP helpers matching previous API surface
  get<T = any>(url: string, config?: AxiosRequestConfig) {
    return this.instance.get<T>(url, config)
  }
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.instance.post<T>(url, data, config)
  }
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.instance.put<T>(url, data, config)
  }
  delete<T = any>(url: string, config?: AxiosRequestConfig) {
    return this.instance.delete<T>(url, config)
  }
}

/**
 * Handles errors globally for the interceptor.
 */
function handleGlobalAxiosError(error: AxiosError) {
    if (error.response?.status === 401) {
    // Unauthorized – redirect to login preserving path
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    } else if (error.response?.status === 403) {
      toast.error('Access denied')
  } else if (error.response?.status && error.response.status >= 500) {
      toast.error('Server error. Please try again later.')
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Request timeout. Please try again.')
    } else if (!error.response) {
      toast.error('Network error. Please check your connection.')
    }
}

/**
 * Utility to normalise API errors to user-friendly messages so components
 * don't have to duplicate this logic.
 */
export const handleApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.error) {
      return error.response.data.error as string
    }
    if (error.response?.status === 401) {
      return 'Authentication required'
    }
    if (error.response?.status === 403) {
      return 'Access denied'
    }
    if (error.response?.status && error.response.status >= 500) {
      return 'Server error. Please try again later.'
    }
    if (error.code === 'ECONNABORTED') {
      return 'Request timeout. Please try again.'
    }
    if (!error.response) {
      return 'Network error. Please check your connection.'
    }
  }
  return 'An unexpected error occurred'
} 

// Export a singleton just like the previous "api" default export so existing
// service files keep working without alteration.
const api = new ApiClient()
export default api 