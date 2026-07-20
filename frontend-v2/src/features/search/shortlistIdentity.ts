import type { ShortlistRemoveCommand } from '@/features/search/types'

export function shortlistItemKey(item: ShortlistRemoveCommand): string {
  return `${item.tenantId}:${item.candidateId}`
}
