import { describe, expect, it } from 'vitest'
import { candidateListSearchParamsSchema } from '@/features/candidates/hooks/useCandidateListParams'

describe('candidate list search params schema', () => {
  it('parses a complete shareable URL state', () => {
    expect(
      candidateListSearchParamsSchema.parse({
        q: 'Mina',
        status: 'screening',
        role: 'Engineer',
        source: 'career_site',
        location: 'Cairo',
        updatedFrom: '2026-07-01',
        updatedTo: '2026-07-20',
        groupBy: 'status',
        page: '2',
        pageSize: '50',
        sort: 'updatedAt',
        direction: 'desc',
      }),
    ).toMatchObject({
      query: 'Mina',
      updatedFrom: '2026-07-01',
      updatedTo: '2026-07-20',
      groupBy: 'status',
      page: 2,
      pageSize: 50,
      sort: 'updatedAt',
      direction: 'desc',
    })
  })

  it('replaces invalid URL values with safe documented defaults', () => {
    expect(
      candidateListSearchParamsSchema.parse({
        q: '',
        status: 'x'.repeat(121),
        role: '',
        source: 'x'.repeat(121),
        location: '',
        updatedFrom: 'yesterday',
        updatedTo: '07/20/2026',
        groupBy: 'company',
        page: '-4',
        pageSize: '500',
        sort: 'score',
        direction: 'sideways',
      }),
    ).toMatchObject({
      updatedFrom: '',
      updatedTo: '',
      status: '',
      source: '',
      groupBy: '',
      page: 1,
      pageSize: 25,
      sort: 'updatedAt',
      direction: 'desc',
    })
  })
})
