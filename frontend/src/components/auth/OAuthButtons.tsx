import { useState, useEffect } from 'react'
import { authService } from '../../services/auth'
import Button from '../ui/Button'
import type { AuthConfig } from '../../types/auth'

export default function OAuthButtons() {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Load auth configuration
    authService.getAuthConfig().then(setConfig)
  }, [])

  const handleAuthentikLogin = async () => {
    if (!config?.authentik) return

    setIsLoading(true)
    try {
      const { authorizeUrl, clientId, redirectUri } = config.authentik
      const url = `${authorizeUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email`
      window.location.href = url
    } catch (error) {
      console.error('Authentik login error:', error)
      setIsLoading(false)
    }
  }

  if (!config) return null

  const hasOAuthOptions = config.methods.includes('authentik')

  if (!hasOAuthOptions) return null

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
            Or continue with
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {config.methods.includes('authentik') && (
          <Button
            onClick={handleAuthentikLogin}
            variant="outline"
            fullWidth
            disabled={isLoading}
            className="justify-center"
          >
            Continue with Authentik
          </Button>
        )}
      </div>
    </div>
  )
} 