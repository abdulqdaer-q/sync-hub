import { describe, expect, it } from 'vitest'
import {
  encodeCandidateListRequest,
  parseCandidateDossierResponse,
  parseCandidateListResponse,
  parseOriginalDocumentUrl,
} from '@/features/candidates/api/candidatesApi'
import {
  candidateDossierResponseFixture,
  candidateListItemFixture,
  candidateListResponseFixture,
} from '@/test/fixtures/candidates'

describe('candidate-list compatibility adapter', () => {
  it('parses the one backend-verified camelCase response shape', () => {
    expect(parseCandidateListResponse(candidateListResponseFixture)).toEqual(
      candidateListResponseFixture,
    )

    expect(
      parseCandidateListResponse({
        ...candidateListResponseFixture,
        items: [
          {
            ...candidateListItemFixture,
            email: null,
            seniority: null,
            updatedAt: null,
          },
        ],
      }).items[0],
    ).toMatchObject({ email: null, seniority: null, updatedAt: null })
  })

  it('rejects malformed fields rather than silently defaulting them', () => {
    expect(() =>
      parseCandidateListResponse({
        ...candidateListResponseFixture,
        itemsTotalCount: '1',
      }),
    ).toThrow()
    expect(() =>
      parseCandidateListResponse({
        ...candidateListResponseFixture,
        filterOptions: { statuses: [] },
      }),
    ).toThrow()
  })

  it('rejects speculative snake_case aliases and conflicting payloads', () => {
    expect(() =>
      parseCandidateListResponse({
        ...candidateListResponseFixture,
        items: [
          {
            ...candidateListItemFixture,
            candidate_id: '33333333-3333-4333-8333-333333333333',
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      parseCandidateListResponse({
        ...candidateListResponseFixture,
        items_total_count: 99,
      }),
    ).toThrow()
  })

  it('encodes the current Edge Function request keys exactly', () => {
    expect(
      encodeCandidateListRequest(['11111111-1111-4111-8111-111111111111'], {
        query: 'Mina',
        status: 'screening',
        role: '',
        source: 'career_site',
        location: '',
        updatedFrom: '2026-07-01',
        updatedTo: '',
        groupBy: 'status',
        page: 2,
        pageSize: 25,
        sort: 'updatedAt',
        direction: 'desc',
      }),
    ).toEqual({
      tenant_ids: ['11111111-1111-4111-8111-111111111111'],
      limit: 25,
      offset: 25,
      query: 'Mina',
      status: 'screening',
      role: null,
      source: 'career_site',
      location: null,
      updated_from: '2026-07-01',
      updated_to: null,
      group_by: 'status',
    })
  })
})

describe('candidate-dossier compatibility adapter', () => {
  it('maps the worker-verified snake_case profile into the canonical dossier', () => {
    expect(
      parseCandidateDossierResponse(
        candidateDossierResponseFixture,
        candidateListItemFixture.candidateId,
      ),
    ).toMatchObject({
      candidateId: candidateListItemFixture.candidateId,
      name: 'Maya Hassan',
      currentTitle: 'Senior Platform Engineer',
      yearsExperience: 9,
      skills: ['TypeScript', 'Kubernetes', 'PostgreSQL'],
      timeline: [
        {
          employer: 'Acme Cloud',
          role: 'Senior Platform Engineer',
          start: '2022-01',
          end: null,
        },
      ],
      evidence: [
        {
          id: 'chunk-1',
          chunkType: 'experience',
          excerpt: 'Led the internal platform and reliability roadmap for six product teams.',
        },
      ],
      jobReadinessLevel: 'L4',
      originalDocumentAvailable: true,
    })
  })

  it('rejects speculative title and experience aliases', () => {
    expect(() =>
      parseCandidateDossierResponse(
        {
          ...candidateDossierResponseFixture,
          candidate: {
            ...candidateDossierResponseFixture.candidate,
            profile_json: {
              ...candidateDossierResponseFixture.candidate.profile_json,
              currentTitle: 'Speculative title',
              yearsExperience: 99,
            },
          },
        },
        candidateListItemFixture.candidateId,
      ),
    ).toThrow()
  })

  it('rejects conflicting verified years-experience sources', () => {
    expect(() =>
      parseCandidateDossierResponse(
        {
          ...candidateDossierResponseFixture,
          profile: {
            ...candidateDossierResponseFixture.profile,
            years_of_experience: 12,
          },
        },
        candidateListItemFixture.candidateId,
      ),
    ).toThrow('Conflicting years of experience')
  })

  it('reduces the backend-owned signed-document response to a URL string', () => {
    expect(
      parseOriginalDocumentUrl({
        url: 'https://storage.example.com/signed/candidate.pdf',
        source: 'gcs_signed_url',
        expires_at: '2026-07-20T12:15:00.000Z',
        original_filename: 'maya-hassan.pdf',
      }),
    ).toBe('https://storage.example.com/signed/candidate.pdf')
  })
})
