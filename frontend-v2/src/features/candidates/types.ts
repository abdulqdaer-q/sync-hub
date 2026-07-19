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

export const candidateTimelineEntrySchema = z
  .object({
    key: z.string().min(1),
    employer: z.string(),
    role: z.string(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    location: z.string().nullable(),
    scope: z.string(),
  })
  .strict()

export const candidateEducationEntrySchema = z
  .object({
    key: z.string().min(1),
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    description: z.string(),
  })
  .strict()

export const candidateProjectSchema = z
  .object({
    key: z.string().min(1),
    name: z.string(),
    description: z.string(),
    technologies: z.array(z.string()),
  })
  .strict()

export const candidateDossierSchema = z
  .object({
    candidateId: z.string().min(1),
    name: z.string().min(1),
    currentTitle: z.string(),
    headline: z.string(),
    location: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    yearsExperience: z.number().min(0).max(80),
    seniority: z.enum(['junior', 'mid', 'senior', 'staff-plus', 'unclassified']),
    primaryRole: z.string().nullable(),
    skills: z.array(z.string()),
    skillMatrix: z.array(
      z
        .object({
          skill: z.string(),
          aliases: z.array(z.string()),
          confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    summary: z.string(),
    timeline: z.array(candidateTimelineEntrySchema),
    education: z.array(candidateEducationEntrySchema),
    projects: z.array(candidateProjectSchema),
    languages: z.array(z.string()),
    certifications: z.array(z.string()),
    evidence: z.array(
      z.object({ id: z.string().min(1), chunkType: z.string(), excerpt: z.string() }).strict(),
    ),
    status: z.string().nullable(),
    jobReadinessLevel: z.enum(['L1', 'L2', 'L3', 'L4', 'L5']),
    preferredWorkMode: z.string().nullable(),
    primarySkills: z.array(z.string()),
    noticePeriod: z.string().nullable(),
    englishProficiency: z.string().nullable(),
    expectedSalary: z
      .object({ amount: z.number().nonnegative(), currency: z.string().min(1) })
      .strict()
      .nullable(),
    isPreScreened: z.boolean(),
    syncAffiliation: z.string().nullable(),
    internalVettingNotes: z.string().nullable(),
    currentLocationCity: z.string().nullable(),
    willingnessToRelocate: z.boolean().nullable(),
    externalProfiles: z
      .object({
        linkedin: z.string().url().nullable(),
        github: z.string().url().nullable(),
        portfolio: z.string().url().nullable(),
      })
      .strict(),
    aiProfileSummary: z.string().nullable(),
    employmentTypePreference: z.array(z.string()),
    lastInteractionDate: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    missingFields: z.array(z.string()),
    parseWarnings: z.array(z.string()),
    originalDocumentAvailable: z.boolean(),
    manatalCandidateId: z.string().nullable(),
  })
  .strict()

export type CandidateListItem = z.infer<typeof candidateListItemSchema>
export type CandidateListResponse = z.infer<typeof candidateListResponseSchema>
export type CandidateListParams = z.infer<typeof candidateListParamsSchema>
export type CandidateDossier = z.infer<typeof candidateDossierSchema>
