import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTestFakeTimers } from '@/test/useTestFakeTimers'
import { useDebouncedValue } from '@/features/search/hooks/useDebouncedValue'

describe('useDebouncedValue', () => {
  useTestFakeTimers()

  it('waits before publishing a changed value', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'data' },
    })

    rerender({ value: 'data engineer' })
    expect(result.current).toBe('data')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('data')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('data engineer')
  })
})
