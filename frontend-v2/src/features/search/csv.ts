import type { SearchCsvRow, ShortlistItem } from '@/features/search/types'

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
  const rawText = String(value)
  const text = /^[\t\r ]*[=+\-@]/.test(rawText) ? `'${rawText}` : rawText
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function rowsToCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
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
  return rowsToCsv([columns, ...data])
}

export function toShortlistCsv(items: ShortlistItem[], siteOrigin: string): string {
  return rowsToCsv([
    [
      'Name',
      'Title',
      'Location',
      'Years Experience',
      'Seniority',
      'Primary Role',
      'Match Rate',
      'Top Skills',
      'CV URL',
      'Source Query',
      'Dossier URL',
    ],
    ...items.map((item) => [
      item.candidateName,
      item.currentTitle,
      item.location,
      item.yearsExperience ?? '',
      item.seniority ?? '',
      item.primaryRole ?? '',
      item.matchRate === null ? '' : `${item.matchRate}%`,
      item.topSkills.join(', '),
      item.cvUrl ?? '',
      item.sourceQuery,
      `${siteOrigin}/dossier/${item.candidateId}`,
    ]),
  ])
}
