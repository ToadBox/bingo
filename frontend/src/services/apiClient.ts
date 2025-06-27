// Unified API Client Service - Foundation for all API communication
// Implements consistent error handling, request correlation, and response transformation

import { getErrorMessage } from '../../../shared/constants.js';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  requestId?: string;
}

export interface ApiError {
  error: string;
  errorCode: string;
  requestId?: string;
  context?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseURL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'API-Version': 'v1'
    };
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('sessionToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const requestId = this.generateRequestId();
    
    const config: RequestInit = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...this.getAuthHeaders(),
        'X-Request-ID': requestId,
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);
      const responseData = await response.json();

      if (!response.ok) {
        const errorData = responseData as ApiError;
        throw new ApiClientError(
          errorData.error || 'Request failed',
          response.status,
          errorData,
          requestId
        );
      }

      return {
        data: responseData.data || responseData,
        success: true,
        message: responseData.message,
        requestId
      };
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      
      // Network or parsing error
      throw new ApiClientError(
        'Network error occurred',
        0,
        error,
        requestId
      );
    }
  }

  // Convenience methods with proper typing
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // File upload with progress support
  async uploadFile<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, any>,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      const requestId = this.generateRequestId();

      formData.append('file', file);
      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              data: response.data || response,
              success: true,
              message: response.message,
              requestId
            });
          } else {
            reject(new ApiClientError(
              response.error || 'Upload failed',
              xhr.status,
              response,
              requestId
            ));
          }
        } catch (error) {
          reject(new ApiClientError(
            'Failed to parse upload response',
            xhr.status,
            error,
            requestId
          ));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new ApiClientError(
          'Upload network error',
          0,
          null,
          requestId
        ));
      });

      xhr.open('POST', `${this.baseURL}${endpoint}`);
      
      // Add auth headers
      const authHeaders = this.getAuthHeaders();
      Object.entries(authHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.setRequestHeader('X-Request-ID', requestId);

      xhr.send(formData);
    });
  }

  // Health check method
  async health(): Promise<boolean> {
    try {
      await this.get('/health');
      return true;
    } catch {
      return false;
    }
  }
}

// Error handling utility
export const handleApiError = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    switch (error.status) {
      case 401:
        return getErrorMessage('AUTH_REQUIRED');
      case 403:
        return getErrorMessage('AUTH_INSUFFICIENT_PERMISSIONS');
      case 404:
        return getErrorMessage('RESOURCE_NOT_FOUND');
      case 422:
        return error.data?.message || getErrorMessage('VALIDATION_FAILED');
      case 429:
        return getErrorMessage('RATE_LIMIT_EXCEEDED');
      case 0:
        return 'Network connection failed. Please check your internet connection.';
      default:
        return error.message || getErrorMessage('SERVER_ERROR');
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unknown error occurred.';
};

// Singleton instance
export const apiClient = new ApiClient();