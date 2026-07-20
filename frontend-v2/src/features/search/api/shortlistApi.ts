import { z } from 'zod'
import { invokePlatform } from '@/lib/api/client'
import {
  shortlistCommandResponseSchema,
  shortlistItemSchema,
  type SearchResult,
  type ShortlistCommandResponse,
  type ShortlistItem,
} from '@/features/search/types'

const wireShortlistItemSchema = z
  .object({
    user_id: z.string().min(1),
    tenant_id: z.string().min(1),
    candidate_id: z.string().min(1),
    candidate_name: z.string(),
    current_title: z.string(),
    location: z.string(),
    years_experience: z.number().min(0).max(80).nullable(),
    seniority: z.string().nullable(),
    primary_role: z.string().nullable(),
    top_skills: z.array(z.string()),
    match_rate: z.number().int().min(0).max(100).nullable(),
    cv_url: z.string().nullable(),
    original_filename: z.string().nullable(),
    source_query: z.string(),
    search_snapshot: z.record(z.string(), z.json()),
    notes: z.string(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict()

const wireShortlistCommandResponseSchema = z.object({ ok: z.literal(true) }).strict()

export function parseShortlistItem(raw: unknown): ShortlistItem {
  const wire = wireShortlistItemSchema.parse(raw)
  return shortlistItemSchema.parse({
    tenantId: wire.tenant_id,
    candidateId: wire.candidate_id,
    candidateName: wire.candidate_name,
    currentTitle: wire.current_title,
    location: wire.location,
    yearsExperience: wire.years_experience,
    seniority: wire.seniority,
    primaryRole: wire.primary_role,
    topSkills: wire.top_skills,
    matchRate: wire.match_rate,
    cvUrl: wire.cv_url,
    originalFilename: wire.original_filename,
    sourceQuery: wire.source_query,
    searchSnapshot: { ...wire.search_snapshot },
    notes: wire.notes,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  })
}

export function parseShortlistItems(raw: unknown): ShortlistItem[] {
  return z
    .array(z.unknown())
    .parse(raw)
    .map((item) => parseShortlistItem(item))
}

export function parseShortlistCommandResponse(raw: unknown): ShortlistCommandResponse {
  const wire = wireShortlistCommandResponseSchema.parse(raw)
  return shortlistCommandResponseSchema.parse({ ok: wire.ok })
}

export function encodeShortlistRequest(tenantIds: string[]): Record<string, unknown> {
  return { tenant_ids: tenantIds }
}

export function encodeAddShortlistRequest(
  candidate: SearchResult,
  sourceQuery: string,
): Record<string, unknown> {
  return {
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
      source_query: sourceQuery,
      search_snapshot: {
        summary: candidate.summary,
        matchSignals: candidate.matchSignals,
      },
      notes: '',
    },
  }
}

export function encodeRemoveShortlistRequest(
  tenantId: string,
  candidateId: string,
): Record<string, unknown> {
  return { tenant_id: tenantId, candidate_id: candidateId }
}

export function encodeClearShortlistRequest(tenantIds: string[]): Record<string, unknown> {
  return { tenant_ids: tenantIds }
}

export async function fetchShortlist(tenantIds: string[]): Promise<ShortlistItem[]> {
  return parseShortlistItems(
    await invokePlatform('shortlist_items', encodeShortlistRequest(tenantIds)),
  )
}

export async function addShortlistItem(
  candidate: SearchResult,
  sourceQuery: string,
): Promise<ShortlistItem> {
  return parseShortlistItem(
    await invokePlatform('save_shortlist_item', encodeAddShortlistRequest(candidate, sourceQuery)),
  )
}

export async function removeShortlistItem(
  tenantId: string,
  candidateId: string,
): Promise<ShortlistCommandResponse> {
  return parseShortlistCommandResponse(
    await invokePlatform(
      'delete_shortlist_item',
      encodeRemoveShortlistRequest(tenantId, candidateId),
    ),
  )
}

export async function clearShortlist(tenantIds: string[]): Promise<ShortlistCommandResponse> {
  return parseShortlistCommandResponse(
    await invokePlatform('clear_shortlist_items', encodeClearShortlistRequest(tenantIds)),
  )
}
