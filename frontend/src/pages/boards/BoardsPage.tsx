import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Filter, Grid, List } from 'lucide-react'
import { useBoards, useSearchBoards } from '../../hooks/useBoards'
import { useAuth } from '../../hooks/useAuth'
import BoardCard from '../../components/boards/BoardCard'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

export default function BoardsPage() {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filters, setFilters] = useState({
    isPublic: undefined as boolean | undefined,
    sortBy: 'updated' as 'created' | 'updated' | 'title',
    sortOrder: 'desc' as 'asc' | 'desc'
  })

  // Use search query if available, otherwise get all boards
  const { data: boardsData, isLoading, error } = searchQuery.length > 0
    ? useSearchBoards(searchQuery, { page: 1, limit: 20 })
    : useBoards({ 
        page: 1, 
        limit: 20, 
        isPublic: filters.isPublic,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      })

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  const toggleFilter = (key: keyof typeof filters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value
    }))
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 dark:text-red-400 mb-4">
          Failed to load boards: {error.message}
        </div>
        <Button onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
    <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Bingo Boards
      </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Discover and play community-created bingo games
          </p>
        </div>
        
        {user && (
          <div className="mt-4 sm:mt-0">
            <Link to="/boards/create">
              <Button variant="primary">
                <Plus className="h-4 w-4 mr-2" />
                Create Board
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search boards..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-10"
                fullWidth={false}
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-4">
            {/* Visibility Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <button
                onClick={() => toggleFilter('isPublic', true)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  filters.isPublic === true
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Public
              </button>
              <button
                onClick={() => toggleFilter('isPublic', false)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  filters.isPublic === false
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Private
              </button>
            </div>

            {/* Sort */}
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-')
                setFilters(prev => ({
                  ...prev,
                  sortBy: sortBy as any,
                  sortOrder: sortOrder as any
                }))
              }}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="updated-desc">Recently Updated</option>
              <option value="created-desc">Recently Created</option>
              <option value="title-asc">Title A-Z</option>
              <option value="title-desc">Title Z-A</option>
            </select>

            {/* View Mode */}
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${
                  viewMode === 'grid'
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${
                  viewMode === 'list'
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="loading-spinner h-8 w-8 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading boards...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && boardsData && boardsData.boards.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Grid className="h-16 w-16 mx-auto mb-4" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {searchQuery ? 'No boards found' : 'No boards available'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {searchQuery 
              ? `No boards match "${searchQuery}". Try adjusting your search.`
              : 'Be the first to create a bingo board!'
            }
          </p>
          {user && (
            <Link to="/boards/create">
              <Button variant="primary">
                <Plus className="h-4 w-4 mr-2" />
                Create First Board
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Boards Grid/List */}
      {!isLoading && boardsData && boardsData.boards.length > 0 && (
        <>
          <div className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          }>
            {boardsData.boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                showActions={user?.username === board.creatorUsername}
              />
            ))}
          </div>

          {/* Pagination */}
          {boardsData.pagination.totalPages > 1 && (
            <div className="mt-8 flex justify-center">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Showing {boardsData.boards.length} of {boardsData.pagination.total} boards
                {/* TODO: Add pagination controls */}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
} 