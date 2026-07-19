import { z } from 'zod'
import { invokePlatform } from '@/lib/api/client'
import {
  candidateDossierSchema,
  candidateListGroupBySchema,
  candidateListResponseSchema,
  type CandidateDossier,
  type CandidateListParams,
  type CandidateListResponse,
} from '@/features/candidates/types'

const wireTimelineEntrySchema = z
  .object({
    company: z.string(),
    title: z.string(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    description: z.string(),
    location: z.string().nullable(),
    evidence_lines: z.array(z.number().int().nonnegative()),
  })
  .strict()

const wireEducationEntrySchema = z
  .object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    description: z.string(),
    evidence_lines: z.array(z.number().int().nonnegative()),
  })
  .strict()

const wireProjectSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    technologies: z.array(z.string()),
    evidence_lines: z.array(z.number().int().nonnegative()),
  })
  .strict()

const wireCandidateProfileSchema = z
  .object({
    tenant_id: z.string().min(1),
    candidate_id: z.string().min(1),
    source_document_id: z.string().min(1),
    source_sha256: z.string().min(1),
    name: z.string().min(1),
    current_title: z.string(),
    headline: z.string(),
    location: z.string(),
    email: z.string(),
    phone: z.string(),
    links: z.array(z.string()),
    years_experience: z.number().min(0).max(80),
    seniority: z.enum(['junior', 'mid', 'senior', 'staff-plus', 'unclassified']),
    role_tags: z.array(z.string()),
    skills: z.array(z.string()),
    skill_aliases: z.record(z.string(), z.array(z.string())),
    experience: z.array(wireTimelineEntrySchema),
    education: z.array(wireEducationEntrySchema),
    projects: z.array(wireProjectSchema),
    languages: z.array(z.string()),
    certifications: z.array(z.string()),
    summary: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    confidence: z.number().min(0).max(1),
    missing_fields: z.array(z.string()),
    parse_warnings: z.array(z.string()),
  })
  .strict()

const wireCandidateDossierResponseSchema = z
  .object({
    candidate: z
      .object({
        profile_json: wireCandidateProfileSchema,
        timeline_json: z.array(wireTimelineEntrySchema),
        skill_matrix_json: z
          .object({
            skills: z.array(
              z
                .object({
                  skill: z.string(),
                  aliases: z.array(z.string()),
                  confidence: z.number().min(0).max(1),
                })
                .strict(),
            ),
          })
          .strict(),
        confidence: z.number().min(0).max(1).nullable(),
        missing_fields: z.array(z.string()).nullable(),
        parse_warnings: z.array(z.string()).nullable(),
        location: z.string().nullable(),
        summary_short: z.string().nullable(),
        long_summary: z.string().nullable(),
      })
      .strict(),
    chunks: z.array(
      z.object({ id: z.string().min(1), chunk_type: z.string(), text: z.string() }).strict(),
    ),
    evidence: z.array(
      z.object({ id: z.string().min(1), chunk_type: z.string(), text: z.string() }).strict(),
    ),
    profile: z
      .object({
        status: z.string().nullable(),
        job_readiness_level: z.enum(['L1', 'L2', 'L3', 'L4', 'L5']),
        preferred_work_mode: z.string().nullable(),
        years_of_experience: z.number().min(0).max(80).nullable(),
        primary_skills: z.array(z.string()),
        notice_period: z.string().nullable(),
        english_proficiency: z.string().nullable(),
        expected_salary: z
          .object({ amount: z.number().nonnegative(), currency: z.string().min(1) })
          .strict()
          .nullable(),
        is_pre_screened: z.boolean(),
        sync_affiliation: z.string().nullable(),
        internal_vetting_notes: z.string().nullable(),
        current_location_city: z.string().nullable(),
        willingness_to_relocate: z.boolean().nullable(),
        external_profiles: z
          .object({
            linkedin: z.string().url().nullable().optional(),
            github: z.string().url().nullable().optional(),
            portfolio: z.string().url().nullable().optional(),
          })
          .strict(),
        ai_profile_summary: z.string().nullable(),
        employment_type_preference: z.array(z.string()),
        last_interaction_date: z.string().nullable(),
      })
      .strict(),
    manatalCandidateId: z.string().nullable(),
  })
  .strict()

const wireOriginalDocumentUrlSchema = z
  .object({
    url: z.string().url(),
    source: z.enum(['gcs_signed_url', 'source_uri']),
    expires_at: z.string().nullable(),
    original_filename: z.string().nullable(),
  })
  .strict()

function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function timelineKey(entry: z.infer<typeof wireTimelineEntrySchema>): string {
  return [entry.company, entry.title, entry.start_date, entry.end_date, entry.description].join('|')
}

export function parseCandidateDossierResponse(raw: unknown, candidateId: string): CandidateDossier {
  const wire = wireCandidateDossierResponseSchema.parse(raw)
  const profile = wire.candidate.profile_json
  if (
    wire.profile.years_of_experience !== null &&
    wire.profile.years_of_experience !== profile.years_experience
  ) {
    throw new Error('Conflicting years of experience in candidate dossier response.')
  }

  return candidateDossierSchema.parse({
    candidateId,
    name: profile.name,
    currentTitle: profile.current_title,
    headline: profile.headline,
    location: nullableText(profile.location),
    email: nullableText(profile.email),
    phone: nullableText(profile.phone),
    yearsExperience: profile.years_experience,
    seniority: profile.seniority,
    primaryRole: profile.role_tags[0] ?? null,
    skills: profile.skills,
    skillMatrix: wire.candidate.skill_matrix_json.skills,
    summary: profile.summary,
    timeline: wire.candidate.timeline_json.map((entry) => ({
      key: timelineKey(entry),
      employer: entry.company,
      role: entry.title,
      start: entry.start_date,
      end: entry.end_date,
      location: entry.location,
      scope: entry.description,
    })),
    education: profile.education.map((entry) => ({
      key: [entry.institution, entry.degree, entry.field, entry.start_date, entry.end_date].join(
        '|',
      ),
      institution: entry.institution,
      degree: entry.degree,
      field: entry.field,
      start: entry.start_date,
      end: entry.end_date,
      description: entry.description,
    })),
    projects: profile.projects.map((project) => ({
      key: [project.name, project.description, ...project.technologies].join('|'),
      name: project.name,
      description: project.description,
      technologies: project.technologies,
    })),
    languages: profile.languages,
    certifications: profile.certifications,
    evidence: wire.chunks.map((chunk) => ({
      id: chunk.id,
      chunkType: chunk.chunk_type,
      excerpt: chunk.text,
    })),
    status: wire.profile.status,
    jobReadinessLevel: wire.profile.job_readiness_level,
    preferredWorkMode: wire.profile.preferred_work_mode,
    primarySkills: wire.profile.primary_skills,
    noticePeriod: wire.profile.notice_period,
    englishProficiency: wire.profile.english_proficiency,
    expectedSalary: wire.profile.expected_salary,
    isPreScreened: wire.profile.is_pre_screened,
    syncAffiliation: wire.profile.sync_affiliation,
    internalVettingNotes: wire.profile.internal_vetting_notes,
    currentLocationCity: wire.profile.current_location_city,
    willingnessToRelocate: wire.profile.willingness_to_relocate,
    externalProfiles: {
      linkedin: wire.profile.external_profiles.linkedin ?? null,
      github: wire.profile.external_profiles.github ?? null,
      portfolio: wire.profile.external_profiles.portfolio ?? null,
    },
    aiProfileSummary: wire.profile.ai_profile_summary,
    employmentTypePreference: wire.profile.employment_type_preference,
    lastInteractionDate: wire.profile.last_interaction_date,
    confidence: wire.candidate.confidence,
    missingFields: wire.candidate.missing_fields ?? [],
    parseWarnings: wire.candidate.parse_warnings ?? [],
    originalDocumentAvailable: Boolean(profile.source_document_id),
    manatalCandidateId: wire.manatalCandidateId,
  })
}

export function parseOriginalDocumentUrl(raw: unknown): string {
  return wireOriginalDocumentUrlSchema.parse(raw).url
}

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

export async function fetchCandidateDossier(
  tenantIds: string[],
  candidateId: string,
): Promise<CandidateDossier> {
  const raw = await invokePlatform('candidate_detail', {
    candidate_id: candidateId,
    tenant_ids: tenantIds,
  })
  return parseCandidateDossierResponse(raw, candidateId)
}

export async function fetchOriginalDocumentUrl(
  tenantIds: string[],
  candidateId: string,
): Promise<string> {
  const raw = await invokePlatform('original_document_url', {
    candidate_id: candidateId,
    tenant_ids: tenantIds,
  })
  return parseOriginalDocumentUrl(raw)
}
