import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import {
  candidateListDirectionSchema,
  candidateListGroupBySchema,
  candidateListParamsSchema,
  candidateListSortSchema,
  type CandidateListParams,
} from '@/features/candidates/types'

const positivePageSchema = z
  .string()
  .regex(/^[1-9]\d{0,3}$/)
  .transform((value) => Number.parseInt(value, 10))
  .catch(1)
const pageSizeSchema = z
  .enum(['25', '50', '100'])
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
  .catch(25)
const queryTextSchema = z.string().trim().max(160).catch('')
const shortTextSchema = z.string().trim().max(120).catch('')
const boundedTextSchema = z.string().trim().max(180).catch('')
const isoDateSchema = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).catch('')
const groupByUrlSchema = z.union([candidateListGroupBySchema, z.literal('')]).catch('')

export const candidateListSearchParamsSchema = z
  .object({
    q: queryTextSchema,
    status: shortTextSchema,
    role: boundedTextSchema,
    source: shortTextSchema,
    location: boundedTextSchema,
    updatedFrom: isoDateSchema,
    updatedTo: isoDateSchema,
    groupBy: groupByUrlSchema,
    page: positivePageSchema,
    pageSize: pageSizeSchema,
    sort: candidateListSortSchema.catch('updatedAt'),
    direction: candidateListDirectionSchema.catch('desc'),
  })
  .strict()
  .transform((raw) =>
    candidateListParamsSchema.parse({
      query: raw.q,
      status: raw.status,
      role: raw.role,
      source: raw.source,
      location: raw.location,
      updatedFrom: raw.updatedFrom,
      updatedTo: raw.updatedTo,
      groupBy: raw.groupBy,
      page: raw.page,
      pageSize: raw.pageSize,
      sort: raw.sort,
      direction: raw.direction,
    }),
  )

function readSearchParams(searchParams: URLSearchParams): CandidateListParams {
  return candidateListSearchParamsSchema.parse({
    q: searchParams.get('q') ?? '',
    status: searchParams.get('status') ?? '',
    role: searchParams.get('role') ?? '',
    source: searchParams.get('source') ?? '',
    location: searchParams.get('location') ?? '',
    updatedFrom: searchParams.get('updatedFrom') ?? '',
    updatedTo: searchParams.get('updatedTo') ?? '',
    groupBy: searchParams.get('groupBy') ?? '',
    page: searchParams.get('page') ?? '1',
    pageSize: searchParams.get('pageSize') ?? '25',
    sort: searchParams.get('sort') ?? 'updatedAt',
    direction: searchParams.get('direction') ?? 'desc',
  })
}

const defaultParams = candidateListParamsSchema.parse({
  query: '',
  status: '',
  role: '',
  source: '',
  location: '',
  updatedFrom: '',
  updatedTo: '',
  groupBy: '',
  page: 1,
  pageSize: 25,
  sort: 'updatedAt',
  direction: 'desc',
})

function writeSearchParams(params: CandidateListParams): URLSearchParams {
  const next = new URLSearchParams()
  if (params.query) next.set('q', params.query)
  if (params.status) next.set('status', params.status)
  if (params.role) next.set('role', params.role)
  if (params.source) next.set('source', params.source)
  if (params.location) next.set('location', params.location)
  if (params.updatedFrom) next.set('updatedFrom', params.updatedFrom)
  if (params.updatedTo) next.set('updatedTo', params.updatedTo)
  if (params.groupBy) next.set('groupBy', params.groupBy)
  if (params.page !== defaultParams.page) next.set('page', String(params.page))
  if (params.pageSize !== defaultParams.pageSize) next.set('pageSize', String(params.pageSize))
  if (params.sort !== defaultParams.sort) next.set('sort', params.sort)
  if (params.direction !== defaultParams.direction) next.set('direction', params.direction)
  return next
}

export function useCandidateListParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => readSearchParams(searchParams), [searchParams])

  const updateParams = useCallback(
    (patch: Partial<CandidateListParams>, resetPage = true) => {
      const next = candidateListParamsSchema.parse({
        ...params,
        ...patch,
        page: resetPage ? 1 : (patch.page ?? params.page),
      })
      setSearchParams(writeSearchParams(next), { replace: true })
    },
    [params, setSearchParams],
  )

  const clearFilters = useCallback(() => {
    setSearchParams(
      writeSearchParams({
        ...defaultParams,
        pageSize: params.pageSize,
        sort: params.sort,
        direction: params.direction,
      }),
      { replace: true },
    )
  }, [params.direction, params.pageSize, params.sort, setSearchParams])

  return { params, updateParams, clearFilters }
}
