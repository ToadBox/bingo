import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Grid, Globe, Lock, Info } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCreateBoard } from '../../hooks/useBoards'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

const createBoardSchema = z.object({
  title: z.string()
    .min(1, 'Board title is required')
    .max(100, 'Title must be less than 100 characters'),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional(),
  isPublic: z.boolean(),
  size: z.number()
    .min(3, 'Board size must be at least 3x3')
    .max(9, 'Board size must be at most 9x9'),
  freeSpace: z.boolean(),
})

type CreateBoardFormData = z.infer<typeof createBoardSchema>

export default function CreateBoardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const createBoard = useCreateBoard()
  const [isLoading, setIsLoading] = useState(false)

  const isAnonymous = user?.authProvider === 'anonymous'

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<CreateBoardFormData>({
    resolver: zodResolver(createBoardSchema),
    defaultValues: {
      title: '',
      description: '',
      isPublic: false,
      size: 5,
      freeSpace: true,
    }
  })

  const watchedSize = watch('size')
  const watchedIsPublic = watch('isPublic')

  const onSubmit = async (data: CreateBoardFormData) => {
    console.log('Creating board:', data.title)
    console.log('Form data being sent:', data)
    
    setIsLoading(true)
    try {
      const boardData = {
        title: data.title,
        description: data.description || undefined,
        isPublic: data.isPublic,
        size: data.size,
        freeSpace: data.freeSpace,
      }

      console.log('Processed board data:', boardData)
      
      const newBoard = await createBoard.mutateAsync(boardData)
      
      // Navigate to the new board using unified URL structure
      const username = user?.username || 'unknown'
      navigate(`/${username}/${newBoard.slug}`)
    } catch (error) {
      console.error('Failed to create board:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getBoardPreview = () => {
    const size = watchedSize
    const cells = Array.from({ length: size * size }, (_, i) => i)
    const centerIndex = Math.floor(size / 2) * size + Math.floor(size / 2)
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Board Preview ({size}x{size})
        </h3>
        <div 
          className="grid gap-1 max-w-xs mx-auto"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {cells.map((cellIndex) => (
            <div
              key={cellIndex}
              className={`aspect-square rounded border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs ${
                cellIndex === centerIndex && watchedSize % 2 === 1 && watch('freeSpace')
                  ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600'
                  : 'bg-gray-50 dark:bg-gray-700'
              }`}
            >
              {cellIndex === centerIndex && watchedSize % 2 === 1 && watch('freeSpace') ? (
                <span className="text-blue-600 dark:text-blue-400 font-medium">FREE</span>
              ) : (
                <span className="text-gray-400">•</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Create New Board
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Design your custom bingo board with personalized content
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Form validation errors */}
            {Object.keys(errors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-red-800 font-medium mb-2">Please fix the following errors:</h3>
                <ul className="text-red-700 text-sm space-y-1">
                  {Object.entries(errors).map(([field, error]) => (
                    <li key={field} className="flex items-start space-x-2">
                      <span className="text-red-500">•</span>
                      <span>
                        <strong>{field === 'isPublic' ? 'Visibility' : field}:</strong> {error.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Basic Info */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Basic Information
              </h2>
              
              <Input
                {...register('title')}
                label="Board Title"
                placeholder="Enter board title"
                error={errors.title?.message}
                autoFocus
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400"
                  placeholder="Describe your bingo board..."
                />
                {errors.description && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {errors.description.message}
                  </p>
                )}
              </div>
            </div>

            {/* Board Settings */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Board Settings
              </h2>

              {/* Visibility */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Visibility
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={!watchedIsPublic}
                      onChange={() => {
                        setValue('isPublic', false, { shouldValidate: true })
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div className="flex items-center space-x-2">
                      <Lock className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Private
                        </span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Only you can see this board
                        </p>
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={watchedIsPublic}
                      onChange={() => {
                        setValue('isPublic', true, { shouldValidate: true })
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div className="flex items-center space-x-2">
                      <Globe className="h-4 w-4 text-green-500" />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Public
                        </span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Anyone can view this board
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Board Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Board Size: {watchedSize}x{watchedSize}
                </label>
                <input
                  type="range"
                  {...register('size', { valueAsNumber: true })}
                  min={3}
                  max={9}
                  step={1}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>3x3</span>
                  <span>9x9</span>
                </div>
              </div>

              {/* Free Space */}
              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    {...register('freeSpace')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Free space in center
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Add a free space in the center of the board (odd sizes only)
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-4 space-y-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Creating Board...' : 'Create Board'}
              </Button>
              

            </div>
          </form>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          {getBoardPreview()}
          
          {/* Info Panel */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  Next Steps
                </h3>
                <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <li>• After creating, you'll be able to add content to each cell</li>
                  <li>• Upload images or add text for each bingo square</li>
                  <li>• Share your board with others to play</li>
                  <li>• Track progress as players mark their squares</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 