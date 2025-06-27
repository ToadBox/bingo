import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { 
  ArrowLeft, 
  Edit, 
  Share, 
  Settings, 
  Users, 
  Clock,
  Eye,
  EyeOff,
  Plus,
  Image as ImageIcon,
  Type,
  Save,
  X,
  Menu,
  Grid as GridIcon
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useBoard, useBoardCells, useUpdateCell } from '../../hooks/useBoards'
import { BoardCell } from '../../services/boards'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

interface CellData {
  id: string
  row: number
  col: number
  value: string
  type: 'text' | 'image'
  marked: boolean
  isFreeSpace?: boolean
}

export default function BoardPage() {
  const { username, slug } = useParams<{ username: string; slug: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const [isEditing, setIsEditing] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [cellContent, setCellContent] = useState('')
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Fetch board and cells data
  const { data: board, isLoading: boardLoading, error: boardError } = useBoard(username!, slug!)
  const { data: cells, isLoading: cellsLoading } = useBoardCells(board?.id || '')
  const updateCell = useUpdateCell()

  const isOwner = user && board && (
    (user.authProvider === 'anonymous' && board.createdBy === 'anonymous') ||
    (user.userId === board.createdBy) ||
    user.isAdmin
  )

  const canEdit = isOwner

  useEffect(() => {
    if (boardError) {
      navigate('/boards')
    }
  }, [boardError, navigate])

  const handleCellClick = (cell: CellData) => {
    if (cell.isFreeSpace) return
    
    if (isEditing && canEdit) {
      setEditingCell(cell.id)
      setCellContent(cell.value)
    } else {
      // Toggle cell marking for players
      // This would connect to WebSocket for real-time updates
      console.log('Toggle cell:', cell.id)
    }
  }

  const handleSaveCell = async () => {
    if (!editingCell || !board) return
    
    try {
      await updateCell.mutateAsync({
        boardId: board.id,
        cellId: editingCell,
        data: {
          value: cellContent
        }
      })
      setEditingCell(null)
      setCellContent('')
    } catch (error) {
      console.error('Failed to update cell:', error)
    }
  }

  const handleCancelEdit = () => {
    setEditingCell(null)
    setCellContent('')
  }

  const getBoardGrid = () => {
    if (!board || !cells) return null

    const size = board.settings.size
    const gridCells: (CellData | null)[] = Array(size * size).fill(null)
    
    // Fill grid with cell data
    cells.forEach(cell => {
      const position = cell.row * size + cell.col
      if (position >= 0 && position < size * size) {
        gridCells[position] = {
          id: cell.id,
          row: cell.row,
          col: cell.col,
          value: cell.value || '',
          type: cell.type,
          marked: cell.marked || false,
          isFreeSpace: cell.row === Math.floor(size / 2) && cell.col === Math.floor(size / 2) && board.settings.freeSpace
        }
      }
    })

    return (
      <div 
        className="grid gap-2 w-full max-w-2xl mx-auto"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {gridCells.map((cell, index) => (
          <div
            key={cell?.id || index}
            onClick={() => cell && handleCellClick(cell)}
            className={`
              aspect-square border-2 rounded-lg flex flex-col items-center justify-center p-2 text-center cursor-pointer transition-all relative overflow-hidden
              ${cell?.isFreeSpace 
                ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600' 
                : cell?.marked 
                  ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-600'
                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }
              ${isEditing && canEdit && !cell?.isFreeSpace ? 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20' : ''}
              ${editingCell === cell?.id ? 'ring-2 ring-blue-500' : ''}
            `}
          >
            {editingCell === cell?.id ? (
              <div className="absolute inset-0 p-1 flex flex-col">
                <textarea
                  value={cellContent}
                  onChange={(e) => setCellContent(e.target.value)}
                  className="flex-1 w-full text-xs resize-none border-none outline-none bg-transparent text-gray-900 dark:text-white"
                  placeholder="Enter cell content..."
                  autoFocus
                />
                <div className="flex space-x-1 mt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSaveCell()
                    }}
                    className="flex-1 bg-green-500 text-white rounded text-xs py-1"
                  >
                    <Save className="h-3 w-3 mx-auto" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCancelEdit()
                    }}
                    className="flex-1 bg-red-500 text-white rounded text-xs py-1"
                  >
                    <X className="h-3 w-3 mx-auto" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {cell?.type === 'image' && cell?.value && (
                  <img 
                    src={cell.value} 
                    alt="Cell content"
                    className="w-full h-full object-cover rounded"
                  />
                )}
                {cell?.isFreeSpace ? (
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                    FREE
                  </span>
                ) : (
                  <span className="text-xs font-medium text-gray-900 dark:text-white break-words">
                    {cell?.value || (isEditing && canEdit ? 'Click to edit' : 'Empty')}
                  </span>
                )}
                {cell?.marked && (
                  <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">✓</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    )
  }

  const getBoardList = () => {
    if (!cells || !board) return null

    const isFreeSpace = (cell: BoardCell) => 
      cell.row === Math.floor(board.settings.size / 2) && 
      cell.col === Math.floor(board.settings.size / 2) && 
      board.settings.freeSpace

    return (
      <div className="space-y-2 max-w-2xl mx-auto">
        {cells.map((cell, index) => (
          <div
            key={cell.id}
            className={`
              p-4 border rounded-lg flex items-center space-x-4 cursor-pointer transition-all
              ${isFreeSpace(cell)
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                : cell.marked 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
            onClick={() => !isFreeSpace(cell) && handleCellClick({
              id: cell.id,
              row: cell.row,
              col: cell.col,
              value: cell.value || '',
              type: cell.type,
              marked: cell.marked || false,
              isFreeSpace: isFreeSpace(cell)
            })}
          >
            <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-sm font-medium">
              {index + 1}
            </div>
            {cell.type === 'image' && cell.value && (
              <img 
                src={cell.value} 
                alt="Cell content"
                className="w-12 h-12 object-cover rounded"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {isFreeSpace(cell) ? 'FREE SPACE' : cell.value || 'Empty cell'}
              </p>
            </div>
            {cell.marked && (
              <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (boardLoading || cellsLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Board Not Found
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          The board you're looking for doesn't exist or has been removed.
        </p>
        <Link to="/boards">
          <Button variant="primary">Browse Boards</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between mb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 -mx-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 dark:text-gray-400"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back</span>
        </button>
        
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="p-2 text-gray-600 dark:text-gray-400"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {board.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Created by {board.createdBy} • {board.settings.size}x{board.settings.size} board
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            {viewMode === 'grid' ? <GridIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          
          {canEdit && (
            <Button
              variant={isEditing ? "danger" : "outline"}
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Stop Editing
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Board
                </>
              )}
            </Button>
          )}
          
          <Button variant="outline">
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="lg:hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{board.title}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Created by {board.createdBy} • {board.settings.size}x{board.settings.size} board
          </p>
          
          <div className="space-y-2">
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="w-full flex items-center space-x-2 p-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              {viewMode === 'grid' ? <Menu className="h-4 w-4" /> : <GridIcon className="h-4 w-4" />}
              <span>{viewMode === 'grid' ? 'List View' : 'Grid View'}</span>
            </button>
            
            {canEdit && (
              <button
                onClick={() => {
                  setIsEditing(!isEditing)
                  setShowMobileMenu(false)
                }}
                className="w-full flex items-center space-x-2 p-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <Edit className="h-4 w-4" />
                <span>{isEditing ? 'Stop Editing' : 'Edit Board'}</span>
              </button>
            )}
            
            <button className="w-full flex items-center space-x-2 p-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <Share className="h-4 w-4" />
              <span>Share Board</span>
            </button>
          </div>
        </div>
      )}

      {/* Board Content */}
      <div className="space-y-6">
        {board.description && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <p className="text-gray-700 dark:text-gray-300">{board.description}</p>
          </div>
        )}

        {isEditing && canEdit && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              <strong>Edit Mode:</strong> Click on any cell to edit its content. Changes are saved automatically.
            </p>
          </div>
        )}

        {/* Board Display */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 lg:p-6">
          {viewMode === 'grid' ? getBoardGrid() : getBoardList()}
        </div>

        {/* Board Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {board.settings.size}x{board.settings.size}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Board Size</div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {cells?.filter(cell => cell.value && !(cell.row === Math.floor(board.settings.size / 2) && cell.col === Math.floor(board.settings.size / 2) && board.settings.freeSpace)).length || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Filled Cells</div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {board.isPublic ? <Eye className="h-6 w-6 mx-auto" /> : <EyeOff className="h-6 w-6 mx-auto" />}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {board.isPublic ? 'Public' : 'Private'}
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              0
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Active Players</div>
          </div>
        </div>
      </div>
    </div>
  )
} 