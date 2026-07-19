import { z } from 'zod'
import { invokePlatform } from '@/lib/api/client'
import {
  candidateListGroupBySchema,
  candidateListResponseSchema,
  type CandidateListParams,
  type CandidateListResponse,
} from '@/features/candidates/types'

const wireCandidateListItemSchema = z
  .object({
    tenantId: z.string().min(1),
    candidateId: z.string().min(1),
    name: z.string(),
    email: z.string().nullable(),
    location: z.string(),
    primaryRole: z.string(),
    appliedRole: z.string().nullable(),
    stage: z.string(),
    stageKey: z.string(),
    source: z.string(),
    seniority: z.string().nullable(),
    updatedAt: z.string().nullable(),
    groupKey: z.string().nullable(),
    groupLabel: z.string().nullable(),
  })
  .strict()

const wireCandidateListResponseSchema = z
  .object({
    items: z.array(wireCandidateListItemSchema),
    itemsTotalCount: z.number().int().nonnegative(),
    pageLimit: z.number().int().positive(),
    pageOffset: z.number().int().nonnegative(),
    groupBy: candidateListGroupBySchema.nullable(),
    groups: z.array(
      z
        .object({ key: z.string(), label: z.string(), count: z.number().int().nonnegative() })
        .strict(),
    ),
    filterOptions: z
      .object({
        statuses: z.array(z.string()),
        roles: z.array(z.string()),
        sources: z.array(z.string()),
        locations: z.array(z.string()),
      })
      .strict(),
  })
  .strict()

const candidateListAdapterSchema = wireCandidateListResponseSchema
  .transform((wire) => ({
    items: wire.items,
    itemsTotalCount: wire.itemsTotalCount,
    pageLimit: wire.pageLimit,
    pageOffset: wire.pageOffset,
    groupBy: wire.groupBy,
    groups: wire.groups,
    filterOptions: wire.filterOptions,
  }))
  .pipe(candidateListResponseSchema)

export function parseCandidateListResponse(raw: unknown): CandidateListResponse {
  return candidateListAdapterSchema.parse(raw)
}

function nullableFilter(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

export function encodeCandidateListRequest(
  tenantIds: string[],
  params: CandidateListParams,
): Record<string, unknown> {
  return {
    tenant_ids: tenantIds,
    limit: params.pageSize,
    offset: (params.page - 1) * params.pageSize,
    query: nullableFilter(params.query),
    status: nullableFilter(params.status),
    role: nullableFilter(params.role),
    source: nullableFilter(params.source),
    location: nullableFilter(params.location),
    updated_from: nullableFilter(params.updatedFrom),
    updated_to: nullableFilter(params.updatedTo),
    group_by: nullableFilter(params.groupBy),
  }
}

export async function fetchCandidateList(
  tenantIds: string[],
  params: CandidateListParams,
): Promise<CandidateListResponse> {
  const raw = await invokePlatform('candidates_list', encodeCandidateListRequest(tenantIds, params))
  return parseCandidateListResponse(raw)
}
