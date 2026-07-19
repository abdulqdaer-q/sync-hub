import { z } from 'zod'

export const candidateListGroupBySchema = z.enum(['status', 'role', 'source', 'location'])
// The current RPC has one server-side order: updatedAt descending. Model that
// exact capability instead of offering page-local sorting that would lie once
// the result set spans multiple backend pages.
export const candidateListSortSchema = z.literal('updatedAt')
export const candidateListDirectionSchema = z.literal('desc')

export const candidateListItemSchema = z
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

export const candidateListGroupSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    count: z.number().int().nonnegative(),
  })
  .strict()

export const candidateListResponseSchema = z
  .object({
    items: z.array(candidateListItemSchema),
    itemsTotalCount: z.number().int().nonnegative(),
    pageLimit: z.number().int().positive(),
    pageOffset: z.number().int().nonnegative(),
    groupBy: candidateListGroupBySchema.nullable(),
    groups: z.array(candidateListGroupSchema),
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

export const candidateListParamsSchema = z
  .object({
    query: z.string().trim().max(160),
    status: z.string().trim().max(120),
    role: z.string().trim().max(180),
    source: z.string().trim().max(120),
    location: z.string().trim().max(180),
    updatedFrom: z.string().trim().max(40),
    updatedTo: z.string().trim().max(40),
    groupBy: z.union([candidateListGroupBySchema, z.literal('')]),
    page: z.number().int().positive().max(10_000),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
    sort: candidateListSortSchema,
    direction: candidateListDirectionSchema,
  })
  .strict()

export type CandidateListItem = z.infer<typeof candidateListItemSchema>
export type CandidateListResponse = z.infer<typeof candidateListResponseSchema>
export type CandidateListParams = z.infer<typeof candidateListParamsSchema>
