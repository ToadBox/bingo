import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import { Plus, Grid, Users } from 'lucide-react'

export default function HomePage() {
  const { user } = useAuth()

  return (
    <div className="max-w-4xl mx-auto">
      {/* Welcome Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to ToadBox Bingo
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          Create and play custom bingo games with friends
        </p>
        
        {user && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
            <p className="text-blue-800 dark:text-blue-200">
              {user.authProvider === 'anonymous' ? (
                'Welcome, you are logged in anonymously.'
              ) : (
                <>
                  Welcome back, <span className="font-semibold">{user.username}</span>! 
                  You're logged in with {user.authProvider} authentication.
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Action Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-lg mb-4">
            <Plus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Create Board
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Design your own custom bingo board with personalized content
          </p>
          <Link to="/boards/create">
            <Button variant="primary" fullWidth>
              Create New Board
            </Button>
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-lg mb-4">
            <Grid className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Browse Boards
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Explore public boards created by the community
          </p>
          <Link to="/boards">
            <Button variant="outline" fullWidth>
              View All Boards
            </Button>
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/50 rounded-lg mb-4">
            <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Join Board
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Enter a board code to quickly access any board
          </p>
          <Button variant="outline" fullWidth>
            Enter Code
          </Button>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Features
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Real-time Updates</h3>
              <p className="text-gray-600 dark:text-gray-400">See changes instantly as players mark their boards</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full mt-2"></div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Custom Boards</h3>
              <p className="text-gray-600 dark:text-gray-400">Create boards with your own content and images</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Chat Integration</h3>
              <p className="text-gray-600 dark:text-gray-400">Chat with other players while playing</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Multiple Auth Options</h3>
              <p className="text-gray-600 dark:text-gray-400">Sign in with Google, Discord, or create an account</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 