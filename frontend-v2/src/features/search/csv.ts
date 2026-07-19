import type { SearchCsvRow } from '@/features/search/types'

const columns = [
  'Name',
  'Title',
  'Location',
  'Years Experience',
  'Seniority',
  'Primary Role',
  'Match Rate',
  'Top Skills',
]

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(rows: SearchCsvRow[]): string {
  const data = rows.map((row) => [
    row.name,
    row.currentTitle,
    row.location,
    row.yearsExperience,
    row.seniority,
    row.primaryRole,
    `${row.matchRate}%`,
    row.topSkills.join(', '),
  ])
  return [columns, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
