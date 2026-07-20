import { describe, expect, it } from 'vitest'
import { toCsv, toShortlistCsv } from '@/features/search/csv'
import { parseShortlistItem } from '@/features/search/api/shortlistApi'
import { shortlistItemFixture } from '@/test/fixtures/shortlist'

describe('search CSV export', () => {
  it('quotes commas, quotes, and newlines without losing values', () => {
    expect(
      toCsv([
        {
          name: 'Hassan, Maya',
          currentTitle: 'Senior "Platform" Engineer',
          location: 'Cairo\nEgypt',
          yearsExperience: 9,
          seniority: 'senior',
          primaryRole: 'platform-engineering',
          matchRate: 92,
          topSkills: ['Kubernetes', 'TypeScript'],
        },
      ]),
    ).toBe(
      'Name,Title,Location,Years Experience,Seniority,Primary Role,Match Rate,Top Skills\r\n"Hassan, Maya","Senior ""Platform"" Engineer","Cairo\nEgypt",9,senior,platform-engineering,92%,"Kubernetes, TypeScript"',
    )
  })

  it('neutralizes spreadsheet formulas in candidate-controlled cells', () => {
    expect(
      toCsv([
        {
          name: '=HYPERLINK("https://example.test")',
          currentTitle: '+cmd',
          location: '@remote',
          yearsExperience: 9,
          seniority: '-senior',
          primaryRole: 'platform-engineering',
          matchRate: 92,
          topSkills: ['Kubernetes'],
        },
      ]),
    ).toContain('"\'=HYPERLINK(""https://example.test"")",\'+cmd,\'@remote,9,\'-senior')
  })

  it('exports the saved shortlist with CV, source-query, and dossier fields', () => {
    expect(toShortlistCsv([parseShortlistItem(shortlistItemFixture)], 'https://sync.example')).toBe(
      'Name,Title,Location,Years Experience,Seniority,Primary Role,Match Rate,Top Skills,CV URL,Source Query,Dossier URL\r\nMaya Hassan,Senior Platform Engineer,"Cairo, Egypt",8,senior,platform engineer,91%,"Kubernetes, Go",gs://candidate-cvs/maya.pdf,platform engineer,https://sync.example/dossier/22222222-2222-4222-8222-222222222222',
    )
  })
})
