import React from 'react'
import { UI_STATES, DISPLAY_CONFIG } from '../../utils/constants'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <div 
      className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = 'Loading...', 
  size = 'md',
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <LoadingSpinner size={size} />
      <p className="mt-2 text-gray-600 dark:text-gray-400">{message}</p>
    </div>
  )
}

interface SkeletonProps {
  className?: string
  rows?: number
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  className = '', 
  rows = 1 
}) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div 
          key={index}
          className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 last:mb-0"
        />
      ))}
    </div>
  )
}

interface BoardSkeletonProps {
  count?: number
}

export const BoardSkeleton: React.FC<BoardSkeletonProps> = ({ 
  count = DISPLAY_CONFIG.BOARDS_PER_PAGE 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="animate-pulse">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4" />
            <div className="flex justify-between items-center">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface CellSkeletonProps {
  size?: number
}

export const CellSkeleton: React.FC<CellSkeletonProps> = ({ 
  size = 5 
}) => {
  const totalCells = size * size

  return (
    <div 
      className="grid gap-1 w-full max-w-2xl mx-auto"
      style={{ 
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        aspectRatio: '1'
      }}
    >
      {Array.from({ length: totalCells }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded aspect-square"
        />
      ))}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An error occurred while loading the content.',
  onRetry,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      <div className="w-16 h-16 mb-4 text-red-500">
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title?: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  icon?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items found',
  message = 'There are no items to display.',
  actionLabel,
  onAction,
  icon,
  className = ''
}) => {
  const defaultIcon = (
    <svg className="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm8 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V8z" clipRule="evenodd" />
    </svg>
  )

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      <div className="mb-4">
        {icon || defaultIcon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md">
        {message}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// Higher-order component for async state management
interface AsyncStateProps {
  state: string
  data?: any
  error?: Error | string
  loading?: React.ReactNode
  children: React.ReactNode
  onRetry?: () => void
}

export const AsyncState: React.FC<AsyncStateProps> = ({
  state,
  data,
  error,
  loading,
  children,
  onRetry
}) => {
  switch (state) {
    case UI_STATES.LOADING:
      return <>{loading || <LoadingState />}</>
    
    case UI_STATES.ERROR:
      return (
        <ErrorState
          message={typeof error === 'string' ? error : error?.message}
          onRetry={onRetry}
        />
      )
    
    case UI_STATES.SUCCESS:
      if (!data || (Array.isArray(data) && data.length === 0)) {
        return (
          <EmptyState
            title="No data found"
            message="There's nothing to display here yet."
          />
        )
      }
      return <>{children}</>
    
    default:
      return <>{children}</>
  }
} 