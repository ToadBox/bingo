// Simplified Error Handling Utility
// Provides centralized error management and user-friendly messaging

import { getErrorMessage } from '../../../shared/constants.js';

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

// Centralized error handling utility
export const handleApiError = (error: unknown): string => {
  if (error instanceof ApiError) {
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

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Determine error severity
export const getErrorSeverity = (error: unknown): ErrorSeverity => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
      case 500:
      case 503:
        return ErrorSeverity.CRITICAL;
      case 401:
      case 403:
        return ErrorSeverity.HIGH;
      case 404:
      case 422:
        return ErrorSeverity.MEDIUM;
      case 429:
        return ErrorSeverity.LOW;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }
  
  return ErrorSeverity.HIGH;
};