import { toCsv, toShortlistCsv } from '@/features/search/csv'
import type { SearchCsvRow, ShortlistItem } from '@/features/search/types'

function download(filename: string, csv: string): void {
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

export function downloadCsv(rows: SearchCsvRow[]): void {
  download('talent-search-results.csv', toCsv(rows))
}

export function downloadShortlistCsv(items: ShortlistItem[]): void {
  const date = new Date().toISOString().slice(0, 10)
  download(`candidate-shortlist-${date}.csv`, toShortlistCsv(items, window.location.origin))
}
