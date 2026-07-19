import { useMutation, useQuery } from '@tanstack/react-query'
import {
  fetchCandidateDossier,
  fetchCandidateList,
  fetchOriginalDocumentUrl,
} from '@/features/candidates/api/candidatesApi'
import type { CandidateListParams } from '@/features/candidates/types'
import { useTenantScope } from '@/lib/auth/useTenantScope'

export function useCandidateListQuery(params: CandidateListParams) {
  const scope = useTenantScope()
  const query = useQuery({
    queryKey: ['candidates', scope.scopeKey, params],
    queryFn: () => fetchCandidateList(scope.resolvedTenantIds, params),
  })

  return { ...query, scope }
}

export function useCandidateDossierQuery(candidateId: string | undefined) {
  const scope = useTenantScope()
  const query = useQuery({
    queryKey: [scope.scopeKey, 'candidate-dossier', candidateId],
    queryFn: () => fetchCandidateDossier(scope.resolvedTenantIds, candidateId ?? ''),
    enabled: Boolean(candidateId),
    staleTime: 10 * 60 * 1_000,
  })

  return { ...query, scope }
}

export function useOriginalDocumentMutation(candidateId: string) {
  const scope = useTenantScope()
  return useMutation({
    mutationKey: [scope.scopeKey, 'candidate-original-document', candidateId],
    mutationFn: () => fetchOriginalDocumentUrl(scope.resolvedTenantIds, candidateId),
  })
}
