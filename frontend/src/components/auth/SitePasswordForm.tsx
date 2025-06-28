import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../hooks/useAuth'
import Button from '../ui/Button'
import Input from '../ui/Input'
import OAuthButtons from './OAuthButtons'

const sitePasswordSchema = z.object({
  sitePassword: z.string().min(1, 'Site password is required'),
  username: z.string()
    .max(20, 'Username must be less than 20 characters')
    .regex(/^[a-zA-Z0-9_-]*$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .optional(),
})

type SitePasswordFormData = z.infer<typeof sitePasswordSchema>

export default function SitePasswordForm() {
  const { loginWithSitePassword } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    watch,
  } = useForm<SitePasswordFormData>({
    resolver: zodResolver(sitePasswordSchema),
    defaultValues: {
      username: ''
    }
  })

  const watchedUsername = watch('username')

  const onSubmit = async (data: SitePasswordFormData) => {
    setIsLoading(true)
    try {
      const credentials = {
        sitePassword: data.sitePassword,
        username: data.username || 'Anonymous'
      }
      
      const result = await loginWithSitePassword(credentials)
      if (!result.success && result.error) {
        setError('sitePassword', { message: result.error })
      }
    } catch (error) {
      setError('sitePassword', { message: 'An unexpected error occurred' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Access
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Enter the site password for quick access
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          {...register('sitePassword')}
          type="password"
          label="Site Password"
          placeholder="Enter the site password"
          error={errors.sitePassword?.message}
          autoComplete="current-password"
        />

        <Input
          {...register('username')}
          type="text"
          label="Username (optional)"
          placeholder="Choose your username"
          error={errors.username?.message}
          helpText={`You'll be known as "${watchedUsername || 'Anonymous'}" on boards you create`}
        />

        <Button
          type="submit"
          fullWidth
          isLoading={isLoading}
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Enter Site'}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Quick access for browsing and creating boards
        </p>
      </div>

      <OAuthButtons />
    </div>
  )
} 