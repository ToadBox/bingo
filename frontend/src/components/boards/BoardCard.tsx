import { Link } from 'react-router-dom'
import { Calendar, User, Grid, Eye, Lock, Globe } from 'lucide-react'
import { Board } from '../../services/boards'

interface BoardCardProps {
  board: Board
  showActions?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

export default function BoardCard({ board, showActions = false, onEdit, onDelete }: BoardCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getBoardUrl = () => {
    return `/${board.creatorUsername || 'unknown'}/${board.slug}`
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-200">
      {/* Card Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <Link
              to={getBoardUrl()}
              className="block hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {board.title}
              </h3>
            </Link>
            {board.description && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {board.description}
              </p>
            )}
          </div>
          
          {/* Visibility Icon */}
          <div className="flex-shrink-0 ml-3">
            {board.isPublic ? (
              <div title="Public board">
                <Globe className="h-5 w-5 text-green-500" />
              </div>
            ) : (
              <div title="Private board">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4">
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            {/* Creator */}
            <div className="flex items-center space-x-1">
              <User className="h-4 w-4" />
              <span>{board.creatorUsername || 'Unknown'}</span>
            </div>
            
            {/* Board Size */}
            <div className="flex items-center space-x-1">
              <Grid className="h-4 w-4" />
              <span>{board.settings.size}x{board.settings.size}</span>
            </div>
            
            {/* Cell Count */}
            {board.cellCount !== undefined && (
              <div className="flex items-center space-x-1">
                <Eye className="h-4 w-4" />
                <span>{board.cellCount} cells</span>
              </div>
            )}
          </div>

          {/* Date */}
          <div className="flex items-center space-x-1">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(board.lastUpdated)}</span>
          </div>
        </div>

        {/* Progress Bar (if completion rate available) */}
        {board.completionRate !== undefined && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>Completion</span>
              <span>{Math.round(board.completionRate)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${board.completionRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Card Footer with Actions */}
      {showActions && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-b-lg border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <Link
              to={getBoardUrl()}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
            >
              View Board
            </Link>
            
            <div className="flex space-x-2">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 