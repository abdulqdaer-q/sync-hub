import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Opts one test suite into deterministic fake timers without leaving mocked
 * clocks behind for React Query or user-event tests in the same worker.
 */
export function useTestFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })
}
