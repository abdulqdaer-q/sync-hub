import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchCandidateList } from '@/features/candidates/api/candidatesApi'
import type { CandidateListParams } from '@/features/candidates/types'
import { useTenantScope } from '@/lib/auth/useTenantScope'

export function useCandidateListQuery(params: CandidateListParams) {
  const scope = useTenantScope()
  const query = useQuery({
    queryKey: ['candidates', scope.scopeKey, params],
    queryFn: () => fetchCandidateList(scope.resolvedTenantIds, params),
    placeholderData: keepPreviousData,
  })

  return { ...query, scope }
}
