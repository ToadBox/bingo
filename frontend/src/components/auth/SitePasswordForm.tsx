import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../hooks/useAuth'
import Button from '../ui/Button'
import Input from '../ui/Input'
import OAuthButtons from './OAuthButtons'

const sitePasswordSchema = z.object({
  password: z.string().min(1, 'Site password is required'),
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
  } = useForm<SitePasswordFormData>({
    resolver: zodResolver(sitePasswordSchema),
  })

  const onSubmit = async (data: SitePasswordFormData) => {
    setIsLoading(true)
    try {
      const result = await loginWithSitePassword(data)
      if (!result.success && result.error) {
        setError('password', { message: result.error })
      }
    } catch (error) {
      setError('password', { message: 'An unexpected error occurred' })
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
          Enter the site password for anonymous access
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          {...register('password')}
          type="password"
          label="Site Password"
          placeholder="Enter the site password"
          error={errors.password?.message}
          autoComplete="current-password"
        />

        <Button
          type="submit"
          fullWidth
          isLoading={isLoading}
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Quick Access'}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This provides anonymous access to the bingo site
        </p>
      </div>

      <OAuthButtons />
    </div>
  )
} 