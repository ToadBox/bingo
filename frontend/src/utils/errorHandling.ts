// Enhanced Error Handling System
// Provides centralized error management, user-friendly messaging, and error reporting

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { getErrorMessage } from '../../../shared/constants.js';
import { ApiClientError } from '../services/apiClient';

// Enhanced API Error class for better error context
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Error severity levels for different handling strategies
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error context for better debugging and user experience
export interface ErrorContext {
  component?: string;
  action?: string;
  user?: string;
  timestamp: number;
  url: string;
  userAgent: string;
}

// Centralized error handling utility
export const handleApiError = (error: unknown, context?: Partial<ErrorContext>): string => {
  // Log error for debugging (in development)
  if (import.meta.env?.DEV) {
    console.error('API Error:', error, context);
  }

  if (error instanceof ApiClientError || error instanceof ApiError) {
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
      case 500:
        return getErrorMessage('SERVER_ERROR');
      default:
        return error.message || getErrorMessage('SERVER_ERROR');
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unknown error occurred. Please try again.';
};

// Determine error severity for appropriate handling
export const getErrorSeverity = (error: unknown): ErrorSeverity => {
  if (error instanceof ApiClientError || error instanceof ApiError) {
    switch (error.status) {
      case 0: // Network error
      case 500: // Server error
      case 503: // Service unavailable
        return ErrorSeverity.CRITICAL;
      case 401: // Unauthorized
      case 403: // Forbidden
        return ErrorSeverity.HIGH;
      case 404: // Not found
      case 422: // Validation error
        return ErrorSeverity.MEDIUM;
      case 429: // Rate limit
        return ErrorSeverity.LOW;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }
  
  return ErrorSeverity.HIGH;
};

// Error reporting utility for production monitoring
export const reportError = async (
  error: Error,
  context: ErrorContext,
  severity: ErrorSeverity
): Promise<void> => {
  // Only report in production
  if (import.meta.env?.PROD) {
    try {
      // You could integrate with error reporting services like Sentry here
      const errorReport = {
        message: error.message,
        stack: error.stack,
        context,
        severity,
        timestamp: Date.now()
      };
      
      // Send to your error reporting endpoint
      fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorReport)
      }).catch(() => {
        // Silently fail error reporting to not disrupt user experience
      });
    } catch {
      // Silently fail error reporting
    }
  }
};

// Global error handler for unhandled promise rejections
export const setupGlobalErrorHandling = (): void => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const context: ErrorContext = {
      component: 'Global',
      action: 'unhandledrejection',
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    const severity = getErrorSeverity(error);
    
    reportError(error, context, severity);
    
    // Prevent the default browser error handling
    event.preventDefault();
  });

  // Handle global JavaScript errors
  window.addEventListener('error', (event) => {
    const context: ErrorContext = {
      component: 'Global',
      action: 'javascript_error',
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    const error = event.error || new Error(event.message);
    const severity = getErrorSeverity(error);
    
    reportError(error, context, severity);
  });
};

// Error Boundary Component Props
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// Error Boundary Class Component (required for React error boundaries)
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const context: ErrorContext = {
      component: 'ErrorBoundary',
      action: 'component_error',
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    const severity = getErrorSeverity(error);
    
    // Report the error
    reportError(error, context, severity);
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo!);
      }

      // Default error UI
      const errorMessage = handleApiError(this.state.error);
      const severity = getErrorSeverity(this.state.error);
      
             const isCritical = severity === ErrorSeverity.CRITICAL;
       
       return React.createElement('div', {
         className: "min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4"
       }, 
         React.createElement('div', { className: "max-w-md w-full" },
           React.createElement('div', {
             className: `rounded-lg p-6 border-2 ${isCritical 
               ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
               : 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'}`
           },
             React.createElement('div', { className: "flex items-center mb-4" },
               React.createElement('div', {
                 className: `rounded-full p-2 ${isCritical ? 'bg-red-100 dark:bg-red-800' : 'bg-orange-100 dark:bg-orange-800'}`
               },
                 React.createElement('svg', {
                   className: `h-6 w-6 ${isCritical ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`,
                   fill: "none",
                   viewBox: "0 0 24 24", 
                   stroke: "currentColor"
                 },
                   React.createElement('path', {
                     strokeLinecap: "round",
                     strokeLinejoin: "round", 
                     strokeWidth: 2,
                     d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                   })
                 )
               ),
               React.createElement('div', { className: "ml-3" },
                 React.createElement('h3', {
                   className: `text-lg font-semibold ${isCritical ? 'text-red-800 dark:text-red-200' : 'text-orange-800 dark:text-orange-200'}`
                 }, 'Something went wrong')
               )
             ),
             React.createElement('p', {
               className: `mb-4 text-sm ${isCritical ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300'}`
             }, errorMessage),
             React.createElement('div', { className: "flex space-x-3" },
               React.createElement('button', {
                 onClick: this.handleReset,
                 className: `flex-1 px-4 py-2 text-sm font-medium rounded-md border transition-colors ${isCritical 
                   ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100 dark:border-red-600 dark:text-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50'
                   : 'border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-300 dark:bg-orange-900/30 dark:hover:bg-orange-900/50'}`
               }, 'Try Again'),
               React.createElement('button', {
                 onClick: this.handleReload,
                 className: `flex-1 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${isCritical 
                   ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
                   : 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800'}`
               }, 'Reload Page')
             )
           )
         )
       );
    }

    return this.props.children;
  }
}

// Hook for functional components to handle errors gracefully
export const useErrorHandler = () => {
  const [error, setError] = useState<Error | null>(null);

  const handleError = (error: unknown, context?: Partial<ErrorContext>) => {
    const errorInstance = error instanceof Error ? error : new Error(String(error));
    const fullContext: ErrorContext = {
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...context
    };
    
    const severity = getErrorSeverity(errorInstance);
    reportError(errorInstance, fullContext, severity);
    
    setError(errorInstance);
  };

  const clearError = () => setError(null);

  const errorMessage = error ? handleApiError(error) : null;

  return {
    error,
    errorMessage,
    handleError,
    clearError,
    hasError: !!error
  };
};