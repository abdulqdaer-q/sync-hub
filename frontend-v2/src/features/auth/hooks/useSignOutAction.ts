import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth/authContextStore'
import { getUserErrorMessage } from '@/lib/errors/userErrorMessage'

/** Handles sign-out as a transient action; event-handler failures never reach error boundaries. */
export function useSignOutAction() {
  const { signOut } = useAuth()

  return useCallback(async () => {
    try {
      await signOut()
    } catch (error) {
      toast.error(getUserErrorMessage(error))
    }
  }, [signOut])
}
