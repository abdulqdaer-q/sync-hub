import { toCsv } from '@/features/search/csv'
import type { SearchCsvRow } from '@/features/search/types'

export function downloadCsv(rows: SearchCsvRow[]): void {
  const href = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = href
  link.download = 'talent-search-results.csv'
  link.click()
  URL.revokeObjectURL(href)
}
