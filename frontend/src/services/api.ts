import axios, { AxiosInstance, AxiosError } from 'axios'
import toast from 'react-hot-toast'

// Create axios instance with default config
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth headers if needed
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError) => {
    // Handle common errors
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login
      window.location.href = '/login'
    } else if (error.response?.status === 403) {
      toast.error('Access denied')
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Request timeout. Please try again.')
    } else if (!error.response) {
      toast.error('Network error. Please check your connection.')
    }
    
    return Promise.reject(error)
  }
)

export default api

// Helper function to handle API errors
export const handleApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.error) {
      return error.response.data.error
    }
    if (error.response?.status === 401) {
      return 'Authentication required'
    }
    if (error.response?.status === 403) {
      return 'Access denied'
    }
    if (error.response?.status >= 500) {
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