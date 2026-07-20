import { describe, expect, it } from 'vitest'
import {
  encodeAddShortlistRequest,
  encodeClearShortlistRequest,
  encodeRemoveShortlistRequest,
  encodeShortlistRequest,
  parseShortlistCommandResponse,
  parseShortlistItem,
  parseShortlistItems,
} from '@/features/search/api/shortlistApi'
import type { SearchResult } from '@/features/search/types'
import { shortlistItemFixture } from '@/test/fixtures/shortlist'

const candidate = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  candidateId: '22222222-2222-4222-8222-222222222222',
  name: 'Maya Hassan',
  currentTitle: 'Senior Platform Engineer',
  location: 'Cairo, Egypt',
  yearsExperience: 8,
  seniority: 'senior',
  primaryRole: 'platform engineer',
  matchRate: 91,
  scoreRaw: 0.82,
  topSkills: ['Kubernetes', 'Go'],
  matchSignals: { semantic: 0.91, skill: 0.88, experience: 0.86 },
  summary: 'Strong platform engineering match.',
} satisfies SearchResult

describe('shortlist API adapter', () => {
  it('maps the verified snake_case list fixture to the canonical model', () => {
    expect(parseShortlistItems([shortlistItemFixture])).toEqual([
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        candidateId: '22222222-2222-4222-8222-222222222222',
        candidateName: 'Maya Hassan',
        currentTitle: 'Senior Platform Engineer',
        location: 'Cairo, Egypt',
        yearsExperience: 8,
        seniority: 'senior',
        primaryRole: 'platform engineer',
        topSkills: ['Kubernetes', 'Go'],
        matchRate: 91,
        cvUrl: 'gs://candidate-cvs/maya.pdf',
        originalFilename: 'maya-hassan-cv.pdf',
        sourceQuery: 'platform engineer',
        searchSnapshot: {
          summary: 'Strong platform engineering match.',
          matchSignals: { semantic: 0.91, skill: 0.88, experience: 0.86 },
        },
        notes: '',
        createdAt: '2026-07-20T08:00:00.123456+00:00',
        updatedAt: '2026-07-20T08:00:00.123456+00:00',
      },
    ])
  })

  it('maps the verified save response fixture to the canonical model', () => {
    expect(parseShortlistItem(shortlistItemFixture).candidateName).toBe('Maya Hassan')
  })

  it('preserves the backend fields that are explicitly nullable', () => {
    expect(
      parseShortlistItem({
        ...shortlistItemFixture,
        years_experience: null,
        seniority: null,
        primary_role: null,
        match_rate: null,
        cv_url: null,
        original_filename: null,
      }),
    ).toMatchObject({
      yearsExperience: null,
      seniority: null,
      primaryRole: null,
      matchRate: null,
      cvUrl: null,
      originalFilename: null,
    })
  })

  it('rejects malformed fields instead of defaulting them', () => {
    expect(() => parseShortlistItems([{ ...shortlistItemFixture, match_rate: '91' }])).toThrow()
    expect(() =>
      parseShortlistItem({
        ...shortlistItemFixture,
        search_snapshot: { unsupported: undefined },
      }),
    ).toThrow()
    expect(() => {
      const missingCurrentTitle = { ...shortlistItemFixture }
      Reflect.deleteProperty(missingCurrentTitle, 'current_title')
      return parseShortlistItem(missingCurrentTitle)
    }).toThrow()
  })

  it('rejects speculative camelCase wire fields', () => {
    expect(() =>
      parseShortlistItem({
        ...shortlistItemFixture,
        candidateId: shortlistItemFixture.candidate_id,
      }),
    ).toThrow()
  })

  it('validates mutation acknowledgement responses', () => {
    expect(parseShortlistCommandResponse({ ok: true })).toEqual({ ok: true })
    expect(() => parseShortlistCommandResponse({ ok: 'true' })).toThrow()
    expect(() => parseShortlistCommandResponse({ ok: true, result: 'deleted' })).toThrow()
  })

  it('encodes list, add, remove, and clear requests with current backend keys', () => {
    expect(encodeShortlistRequest(['tenant-1'])).toEqual({ tenant_ids: ['tenant-1'] })
    expect(encodeAddShortlistRequest(candidate, 'platform engineer')).toEqual({
      item: {
        tenant_id: candidate.tenantId,
        candidate_id: candidate.candidateId,
        candidate_name: candidate.name,
        current_title: candidate.currentTitle,
        location: candidate.location,
        years_experience: candidate.yearsExperience,
        seniority: candidate.seniority,
        primary_role: candidate.primaryRole,
        top_skills: candidate.topSkills,
        match_rate: candidate.matchRate,
        cv_url: null,
        original_filename: null,
        source_query: 'platform engineer',
        search_snapshot: {
          summary: candidate.summary,
          matchSignals: candidate.matchSignals,
        },
        notes: '',
      },
    })
    expect(encodeRemoveShortlistRequest(candidate.tenantId, candidate.candidateId)).toEqual({
      tenant_id: candidate.tenantId,
      candidate_id: candidate.candidateId,
    })
    expect(encodeClearShortlistRequest(['tenant-1'])).toEqual({ tenant_ids: ['tenant-1'] })
  })
})
