import { createElement, type PropsWithChildren } from 'react'
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { useSignOutAction } from '@/features/auth/hooks/useSignOutAction'
import { ApiError } from '@/lib/api/client'
import { TestAuthProvider } from '@/test/TestAuthProvider'
import { createTestAuthContextValue } from '@/test/createTestAuthContextValue'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('useSignOutAction', () => {
  it('maps an event-handler failure to a transient toast', async () => {
    const signOut = vi.fn().mockRejectedValue(new ApiError('private failure detail', 429))
    function wrapper({ children }: PropsWithChildren) {
      return createElement(
        TestAuthProvider,
        { value: createTestAuthContextValue({ signOut }) },
        children,
      )
    }
    const { result } = renderHook(() => useSignOutAction(), { wrapper })

    await act(() => result.current())

    expect(toast.error).toHaveBeenCalledWith(
      'Too many requests. Please wait a moment and try again.',
    )
  })
})
